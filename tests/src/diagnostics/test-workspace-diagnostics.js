const assert = require('assert');
const vscode = require('vscode');

const {DiagnosticManager} = require('../../../out/diagnostics/manager.js');
const {registerDiagnostics} = require('../../../out/diagnostics/registration.js');

function createDoc(text, fsPath = '/workspace/main.thrift', version = 1) {
    const lines = text.split('\n');
    return {
        uri: vscode.Uri.file(fsPath),
        languageId: 'thrift',
        version,
        getText: () => text,
        lineAt: (line) => ({text: lines[line] || ''}),
        lineCount: lines.length
    };
}

function createWorkspaceIndex(files) {
    const docs = files.map(file => ({
        uri: vscode.Uri.file(file.path),
        text: file.text
    }));
    return {
        getAllFiles: () => docs.map(doc => doc.uri),
        getIncludedUrisForText: () => [],
        getText: async (uri) => {
            const doc = docs.find(candidate => candidate.uri.toString() === uri.toString());
            if (!doc) {
                throw new Error(`missing indexed text for ${uri.toString()}`);
            }
            return doc.text;
        }
    };
}

function installDiagnosticsConfig(values) {
    vscode.workspace.getConfiguration = (section) => ({
        get: (key, defaultValue) => {
            const fullKey = section ? `${section}.${key}` : key;
            if (Object.prototype.hasOwnProperty.call(values, fullKey)) {
                return values[fullKey];
            }
            return defaultValue;
        }
    });
}

function captureDiagnosticCollection() {
    const sets = [];
    const deletes = [];
    let clearCount = 0;
    const originalCreate = vscode.languages.createDiagnosticCollection;
    vscode.languages.createDiagnosticCollection = () => ({
        set: (uri, diagnostics) => sets.push({uri, diagnostics}),
        delete: (uri) => deletes.push(uri),
        clear: () => {
            clearCount += 1;
        },
        dispose: () => {}
    });
    return {
        sets,
        deletes,
        get clearCount() {
            return clearCount;
        },
        restore: () => {
            vscode.languages.createDiagnosticCollection = originalCreate;
        }
    };
}

describe('workspace diagnostics', () => {
    let originalGetConfiguration;
    let originalCreateDiagnosticCollection;
    let originalCommands;
    let originalShowInformationMessage;

    beforeEach(() => {
        originalGetConfiguration = vscode.workspace.getConfiguration;
        originalCreateDiagnosticCollection = vscode.languages.createDiagnosticCollection;
        originalCommands = vscode.commands;
        originalShowInformationMessage = vscode.window.showInformationMessage;
    });

    afterEach(() => {
        vscode.workspace.getConfiguration = originalGetConfiguration;
        vscode.languages.createDiagnosticCollection = originalCreateDiagnosticCollection;
        vscode.commands = originalCommands;
        vscode.window.showInformationMessage = originalShowInformationMessage;
        vscode.workspace.textDocuments = [];
    });

    it('scans indexed workspace files within the configured limit and reports status', async () => {
        installDiagnosticsConfig({
            'thrift.diagnostics.workspaceMode': 'workspace',
            'thrift.diagnostics.workspaceFileLimit': 2,
            'thrift.diagnostics.rules': {}
        });
        const capture = captureDiagnosticCollection();
        const workspaceIndex = createWorkspaceIndex([
            {path: '/workspace/a.thrift', text: 'struct A {\n  1: Missing field\n}'},
            {path: '/workspace/b.thrift', text: 'struct B {\n  1: i32 id\n}'},
            {path: '/workspace/c.thrift', text: 'struct C {\n  1: Missing other\n}'}
        ]);

        try {
            const manager = new DiagnosticManager(undefined, undefined, workspaceIndex);
            await manager.scanWorkspace('test');

            assert.strictEqual(capture.sets.length, 2, 'workspace scan should respect file limit');
            const status = manager.getStatus();
            assert.strictEqual(status.workspaceMode, 'workspace');
            assert.strictEqual(status.indexedFileCount, 2);
            assert.strictEqual(status.filesWithDiagnostics, 1);
            assert.ok(status.lastScanDurationMs >= 0);
            assert.deepStrictEqual(status.topRuleIds[0], {ruleId: 'type.unknown', count: 1});
        } finally {
            capture.restore();
        }
    });

    it('does not publish extension diagnostics when workspace mode is off', async () => {
        installDiagnosticsConfig({
            'thrift.diagnostics.workspaceMode': 'off',
            'thrift.diagnostics.rules': {}
        });
        const capture = captureDiagnosticCollection();
        const workspaceIndex = createWorkspaceIndex([
            {path: '/workspace/a.thrift', text: 'struct A { 1: Missing field }'}
        ]);

        try {
            const manager = new DiagnosticManager(undefined, undefined, workspaceIndex);
            manager.scheduleAnalysis(createDoc('struct A { 1: Missing field }'), true);
            await manager.scanWorkspace('test');

            assert.strictEqual(capture.sets.length, 0);
            assert.ok(capture.clearCount >= 1, 'off mode should clear extension diagnostics');
            assert.strictEqual(manager.getStatus().workspaceMode, 'off');
        } finally {
            capture.restore();
        }
    });

    it('applies diagnostics rule overrides during workspace scans', async () => {
        installDiagnosticsConfig({
            'thrift.diagnostics.workspaceMode': 'workspace',
            'thrift.diagnostics.workspaceFileLimit': 10,
            'thrift.diagnostics.rules': {'type.unknown': 'off'}
        });
        const capture = captureDiagnosticCollection();
        const workspaceIndex = createWorkspaceIndex([
            {path: '/workspace/a.thrift', text: 'struct A {\n  1: Missing field\n}'}
        ]);

        try {
            const manager = new DiagnosticManager(undefined, undefined, workspaceIndex);
            await manager.scanWorkspace('test');

            assert.strictEqual(capture.sets.length, 1);
            assert.strictEqual(capture.sets[0].diagnostics.length, 0);
            assert.strictEqual(manager.getStatus().filesWithDiagnostics, 0);
        } finally {
            capture.restore();
        }
    });

    it('registers a diagnostics status command with workspace scan metrics', async () => {
        installDiagnosticsConfig({
            'thrift.diagnostics.workspaceMode': 'workspace',
            'thrift.diagnostics.workspaceFileLimit': 10,
            'thrift.diagnostics.rules': {}
        });
        const capture = captureDiagnosticCollection();
        const commands = new Map();
        const messages = [];
        vscode.commands = {
            registerCommand: (command, callback) => {
                commands.set(command, callback);
                return {dispose: () => {}};
            }
        };
        vscode.window.showInformationMessage = async (message) => {
            messages.push(message);
        };

        try {
            const context = {subscriptions: []};
            registerDiagnostics(context, {
                workspaceIndex: createWorkspaceIndex([
                    {path: '/workspace/a.thrift', text: 'struct A {\n  1: Missing field\n}'}
                ])
            });
            const command = commands.get('thrift.showDiagnosticsStatus');
            assert.ok(command, 'expected diagnostics status command');

            await command();

            assert.ok(messages[0].includes('Workspace mode: workspace'));
            assert.ok(messages[0].includes('Indexed files: 1'));
            assert.ok(messages[0].includes('type.unknown'));
        } finally {
            capture.restore();
        }
    });
});
