const assert = require('assert');
const path = require('path');
const vscode = require('vscode');

// Modify the auto-injected mock to simulate file system operations
const originalReadFile = vscode.workspace.fs.readFile.bind(vscode.workspace.fs);
const originalStat = vscode.workspace.fs.stat.bind(vscode.workspace.fs);

// Simulate the files that would be read
const simulatedFiles = new Map();

// Setup simulated file content
const includeContent = 'struct Included { 1: i32 id }';
const mainContent = 'include "inc.thrift"\n\nstruct Main { 1: Included item }';

const includePath = path.resolve('/tmp/inc.thrift');
const mainPath = path.resolve('/tmp/main.thrift');

simulatedFiles.set(vscode.Uri.file(includePath).toString(), includeContent);
simulatedFiles.set(vscode.Uri.file(mainPath).toString(), mainContent);

// Override the readFile method to return simulated file content
vscode.workspace.fs.readFile = async (uri) => {
    const key = uri.toString();
    if (simulatedFiles.has(key)) {
        return Buffer.from(simulatedFiles.get(key), 'utf8');
    }
    // For files not in simulation, return empty buffer
    return Buffer.from('');
};

// Override the stat method to indicate files exist
vscode.workspace.fs.stat = async (uri) => {
    const key = uri.toString();
    if (simulatedFiles.has(key)) {
        return {size: simulatedFiles.get(key).length, mtime: Date.now(), type: 1}; // type: 1 = file
    }
    // For files not in simulation, throw error
    const error = new Error('File not found');
    error.code = 'ENOENT';
    throw error;
};

const {
    clearIncludeCaches,
    collectIncludedTypes,
    collectIncludedTypesFromCache,
    getIncludedFiles
} = require('../../../out/diagnostics/include-resolver.js');
const {DiagnosticManager} = require('../../../out/diagnostics');

function createDoc(text, filePath) {
    const uri = vscode.Uri.file(filePath);
    return {
        uri,
        getText: () => text,
        languageId: 'thrift',
        version: 1,
        fileName: filePath,
        lineCount: text.split('\n').length
    };
}

function createWorkspaceIndex(files) {
    const docs = files.map(file => {
        const uri = vscode.Uri.file(file.path);
        return {uri, text: file.text};
    });
    return {
        getIncludedUrisForText: (uri, text) => getIncludedFiles(createDoc(text, uri.fsPath)),
        getText: async (uri) => {
            const doc = docs.find(d => d.uri.toString() === uri.toString());
            if (!doc) {
                throw new Error(`missing indexed text for ${uri.toString()}`);
            }
            return doc.text;
        }
    };
}

async function run() {
    const doc = createDoc(mainContent, mainPath);
    const includedFiles = await getIncludedFiles(doc);

    assert.ok(includedFiles.length >= 1, 'Expected at least one include file');

    if (includedFiles.length > 0) {
        // Compare the URI toString representation since fsPath might differ in mock
        assert.strictEqual(
            includedFiles[0].toString(),
            vscode.Uri.file(includePath).toString(),
            'Expected include path to match'
        );
    }

    const includedTypes = await collectIncludedTypes(doc);
    assert.strictEqual(includedTypes.get('Included'), 'struct', 'Expected included struct type');

    const cachedTypes = collectIncludedTypesFromCache(includedFiles);
    if (cachedTypes) {
        // Cache might not be populated yet, so we check if it exists
        assert.strictEqual(cachedTypes.get('Included'), 'struct', 'Expected cached struct type');
    }

    // Restore original methods
    vscode.workspace.fs.readFile = originalReadFile;
    vscode.workspace.fs.stat = originalStat;
}

describe('diagnostics-include-resolver', () => {
    it('should resolve included files', async () => {
        await run();
    });

    it('uses injected workspace index for included types without workspace fs reads', async () => {
        clearIncludeCaches();
        const indexedIncludePath = path.resolve('/tmp/indexed-inc.thrift');
        const indexedMainPath = path.resolve('/tmp/indexed-main.thrift');
        const indexedIncludeContent = 'struct IndexedIncluded { 1: i32 id }';
        const indexedMainContent = 'include "indexed-inc.thrift"\n\nstruct Main { 1: IndexedIncluded item }';
        const doc = createDoc(indexedMainContent, indexedMainPath);
        const workspaceIndex = createWorkspaceIndex([{path: indexedIncludePath, text: indexedIncludeContent}]);
        const readFile = vscode.workspace.fs.readFile;
        const stat = vscode.workspace.fs.stat;

        try {
            vscode.workspace.fs.readFile = async () => {
                throw new Error('workspace fs readFile should not be used when workspaceIndex is injected');
            };
            vscode.workspace.fs.stat = async () => {
                throw new Error('workspace fs stat should not be used when workspaceIndex is injected');
            };

            const includedTypes = await collectIncludedTypes(doc, undefined, undefined, workspaceIndex);
            assert.strictEqual(includedTypes.get('IndexedIncluded'), 'struct', 'Expected included struct type from index');
        } finally {
            vscode.workspace.fs.readFile = readFile;
            vscode.workspace.fs.stat = stat;
            clearIncludeCaches();
        }
    });

    it('DiagnosticManager uses injected workspace index for include diagnostics', async () => {
        clearIncludeCaches();
        const indexedIncludePath = path.resolve('/tmp/diagnostic-indexed-inc.thrift');
        const indexedMainPath = path.resolve('/tmp/diagnostic-indexed-main.thrift');
        const indexedIncludeContent = 'struct DiagnosticIndexedIncluded { 1: i32 id }';
        const indexedMainContent = 'include "diagnostic-indexed-inc.thrift"\n\nstruct Main { 1: DiagnosticIndexedIncluded item }';
        const doc = createDoc(indexedMainContent, indexedMainPath);
        const workspaceIndex = createWorkspaceIndex([{path: indexedIncludePath, text: indexedIncludeContent}]);
        const readFile = vscode.workspace.fs.readFile;
        const stat = vscode.workspace.fs.stat;
        const createDiagnosticCollection = vscode.languages.createDiagnosticCollection;
        let diagnostics = null;

        try {
            vscode.workspace.fs.readFile = async () => {
                throw new Error('workspace fs readFile should not be used when workspaceIndex is injected');
            };
            vscode.workspace.fs.stat = async () => {
                throw new Error('workspace fs stat should not be used when workspaceIndex is injected');
            };
            vscode.languages.createDiagnosticCollection = () => ({
                set: (_uri, values) => {
                    diagnostics = values;
                },
                clear: () => {},
                delete: () => {},
                dispose: () => {}
            });

            const manager = new DiagnosticManager(undefined, undefined, workspaceIndex);
            await manager.performAnalysis(doc);
            assert.ok(Array.isArray(diagnostics), 'Expected diagnostics collection to be updated');
            assert.strictEqual(diagnostics.length, 0, 'Expected indexed include type to avoid unknown-type diagnostics');
        } finally {
            vscode.workspace.fs.readFile = readFile;
            vscode.workspace.fs.stat = stat;
            vscode.languages.createDiagnosticCollection = createDiagnosticCollection;
            clearIncludeCaches();
        }
    });
});

if (require.main === module) {
    run().catch((error) => {
        console.error(error);
        process.exit(1);
    });
}
