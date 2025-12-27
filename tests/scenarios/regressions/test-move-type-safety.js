const assert = require('assert');
const Module = require('module');
const path = require('path');

// Capture registered command handlers
const commandHandlers = new Map();
const disposables = [];

// WorkspaceEdit mock to track operations
class WorkspaceEdit {
    constructor() { this.inserts = []; this.deletes = []; this.creates = []; }
    insert(uri, pos, text) { this.inserts.push({uri, pos, text}); }
    delete(uri, range) { this.deletes.push({uri, range}); }
    createFile(uri, opts) { this.creates.push({uri, opts}); }
}

const appliedEdits = [];
const warnings = [];

let fileExists = false;
const mockFs = {
    stat: async () => {
        if (fileExists) return {mtime: Date.now(), size: 1};
        const err = new Error('ENOENT');
        err.code = 'ENOENT';
        throw err;
    },
    readFile: async () => Buffer.from('')
};

const mockWatcher = {onDidCreate:()=>{},onDidChange:()=>{},onDidDelete:()=>{},dispose:()=>{}};

const {createVscodeMock, installVscodeMock} = require('../../test-helpers/vscode-mock');
const vscode = createVscodeMock({
    WorkspaceEdit,
    languages: {
        createDiagnosticCollection: () => ({set:()=>{}, delete:()=>{}, clear:()=>{}, dispose:()=>{}}),
        registerDocumentFormattingEditProvider: () => ({dispose(){}}),
        registerDocumentRangeFormattingEditProvider: () => ({dispose(){}}),
        registerDefinitionProvider: () => ({dispose(){}}),
        registerHoverProvider: () => ({dispose(){}}),
        registerDocumentSymbolProvider: () => ({dispose(){}}),
        registerWorkspaceSymbolProvider: () => ({dispose(){}}),
        registerReferencesProvider: () => ({dispose(){}}),
        registerFoldingRangeProvider: () => ({dispose(){}}),
        registerSelectionRangeProvider: () => ({dispose(){}}),
        registerRenameProvider: () => ({dispose(){}}),
        registerCodeActionsProvider: () => ({dispose(){}}),
        registerCompletionItemProvider: () => ({dispose(){}}),
        registerReferenceProvider: () => ({dispose(){}}),
    },
    commands: {
        registerCommand: (id, fn) => { commandHandlers.set(id, fn); return {dispose(){}}; }
    },
    workspace: {
        fs: mockFs,
        applyEdit: async (edit) => { appliedEdits.push(edit); return true; },
        textDocuments: [],
        createFileSystemWatcher: () => mockWatcher,
        onDidOpenTextDocument: () => ({dispose(){}}),
        onDidChangeTextDocument: () => ({dispose(){}}),
        onDidSaveTextDocument: () => ({dispose(){}}),
        onDidCloseTextDocument: () => ({dispose(){}}),
    },
    window: {
        activeTextEditor: null,
        showInputBox: async () => 'User.thrift',
        showWarningMessage: (msg) => { warnings.push(msg); },
        onDidChangeActiveTextEditor: () => ({dispose(){}}),
    },
    DiagnosticCollection: class {},
    Diagnostic: class {},
    CodeActionKind: { Refactor:'', RefactorExtract:'', RefactorMove:'' },
    Uri: {
        file: (p) => ({ fsPath: path.resolve(p), toString(){return 'file://'+path.resolve(p);} })
    },
    Position: function(line, character) { this.line=line; this.character=character; },
    Range: function(a,b,c,d){ this.start={line:a,character:b}; this.end={line:c,character:d}; }
});
installVscodeMock(vscode);


// Hook vscode module
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
    if (request === 'vscode') return vscode;
    return originalLoad(request, parent, isMain);
};

// Load extension
const ext = require('../../../out/src/extension.js');

async function run() {
    const context = {subscriptions: disposables};
    ext.activate(context);
    const handler = commandHandlers.get('thrift.refactor.moveType');
    assert.ok(handler, 'moveType command should be registered');

    // Prepare mock document/editor
    const lines = ['struct User {', ' 1: i32 id,', '}'];
    const doc = {
        languageId: 'thrift',
        lineCount: lines.length,
        uri: vscode.Uri.file('/tmp/source.thrift'),
        lineAt: (i) => ({text: lines[i]}),
        getText: () => lines.join('\n'),
    };
    const editor = {
        document: doc,
        selection: { active: {line:0, character:5} }
    };
    vscode.window.activeTextEditor = editor;

    // Case 1: target file does not exist -> should apply edits
    fileExists = false;
    await handler();
    assert.strictEqual(warnings.length, 0, 'should not warn when target is new');
    assert.strictEqual(appliedEdits.length, 1, 'should apply edits when target is new');
    const edit = appliedEdits[0];
    assert.ok(edit.creates.length === 1, 'should create target file');
    assert.ok(edit.deletes.length === 1, 'should delete original block');
    assert.ok(edit.inserts.length >= 1, 'should insert include and content');

    // Case 2: target file exists -> should warn and skip edits
    const editCountBefore = appliedEdits.length;
    fileExists = true;
    await handler();
    assert.ok(warnings.length > 0, 'should warn when target exists');
    assert.strictEqual(appliedEdits.length, editCountBefore, 'should not apply new edits when target exists');

    console.log('moveType safety test passed');
}

run().catch(err => { console.error(err); process.exit(1); });
