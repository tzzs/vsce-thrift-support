// Scanning fix verification test
const assert = require('assert');
const Module = require('module');
const originalRequire = Module.prototype.require;

// Mock VS Code API
const mockUris = [];
const openDocCalls = [];
const readFileCalls = [];

const vscode = {
    Uri: {
        file: (path) => ({ fsPath: path, toString: () => path })
    },
    workspace: {
        textDocuments: [], // No open documents initially
        findFiles: async (glob) => mockUris,
        openTextDocument: async (uri) => {
            openDocCalls.push(uri.toString());
            return {
                getText: () => 'struct MockStruct { 1: i32 id }',
                uri: uri,
                lineCount: 1,
                lineAt: () => ({ text: '' })
            };
        },
        fs: {
            readFile: async (uri) => {
                readFileCalls.push(uri.toString());
                // Return encoded "struct MockStruct { 1: i32 id }"
                return Buffer.from('struct MockStruct { 1: i32 id }');
            },
            stat: async (uri) => ({ mtime: Date.now(), size: 100 })
        }
    },
    Position: function (line, character) { return { line, character }; },
    Location: function (uri, range) { return { uri, range }; },
    Range: function (startLine, startChar, endLine, endChar) {
        return { start: { line: startLine, character: startChar }, end: { line: endLine, character: endChar } };
    },
    CompletionItemKind: {},
    SymbolKind: {},
    TreeItem: class { },
    EventEmitter: class { fire() { } event() { } dispose() { } },
    languages: {
        createDiagnosticCollection: () => ({ set: () => { }, delete: () => { }, dispose: () => { } }),
        registerReferenceProvider: () => ({ dispose: () => { } })
    }
};

// Mock TextDecoder (Node.js has it globally in newer versions, but safe to ensure)
if (typeof TextDecoder === 'undefined') {
    global.TextDecoder = require('util').TextDecoder;
}

// Override require to serve mock vscode
Module.prototype.require = function (id) {
    if (id === 'vscode') return vscode;
    return originalRequire.apply(this, arguments);
};

// Import the provider to test (after mocking)
// Assuming built files are in ../out
const { ThriftDefinitionProvider } = require('../out/definitionProvider');

async function run() {
    console.log('Running scanning fix tests...');

    // Setup test environment
    const provider = new ThriftDefinitionProvider();

    // Mock workspace/file system
    const fileA = vscode.Uri.file('/path/to/A.thrift');
    const fileB = vscode.Uri.file('/path/to/B.thrift');
    mockUris.push(fileB); // File B is in workspace

    // Document A is open and contains a reference to a type defined in B
    const docA = {
        uri: fileA,
        getText: () => 'include "B.thrift"\nstruct A { 1: MockStruct ms }',
        lineAt: (line) => ({ text: 'struct A { 1: MockStruct ms }' }),
        getWordRangeAtPosition: () => ({ start: { character: 14 }, end: { character: 24 } })
    };

    // Trigger definition search for "MockStruct"
    // This should trigger workspace search because it's not in A
    const pos = new vscode.Position(0, 15); // Cursor on MockStruct

    await provider.provideDefinition(docA, pos, {});

    // Verifications

    // 1. Should have called fs.readFile for File B
    const readFileCalled = readFileCalls.some(p => p.includes('B.thrift'));
    assert.ok(readFileCalled, 'Should verify definition via fs.readFile for workspace files');

    // 2. Should NOT have called openTextDocument for File B
    const openDocCalled = openDocCalls.some(p => p.includes('B.thrift'));
    assert.strictEqual(openDocCalled, false, 'Should NOT trigger openTextDocument (which triggers diagnostics) for workspace search');

    console.log('Scanning fix tests passed!');
}

run().catch(e => {
    console.error('Test failed:', e);
    process.exit(1);
});
