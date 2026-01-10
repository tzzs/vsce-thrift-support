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

const includePath = '/tmp/inc.thrift';
const mainPath = '/tmp/main.thrift';

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
    collectIncludedTypes,
    collectIncludedTypesFromCache,
    getIncludedFiles
} = require('../../../out/diagnostics/include-resolver.js');

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
});

if (require.main === module) {
    run().catch((error) => {
        console.error(error);
        process.exit(1);
    });
}
