// Scanning fix verification test
require('../../require-hook');
const assert = require('assert');
const {createVscodeMock, installVscodeMock} = require('../../mock_vscode.js');

const readFileCalls = [];
const openDocCalls = [];
const mockUris = [];

const vscode = createVscodeMock({
    Uri: {
        file: (p) => ({fsPath: p, toString() {return `file://${p}`;}})
    },
    Position: class {
        constructor(line, character) {
            this.line = line;
            this.character = character;
        }
    },
    workspace: {
        fs: {
            readFile: async (uri) => {
                readFileCalls.push(uri.fsPath);
                return Buffer.from('struct MockStruct {1: i32 id}');
            }
        },
        openTextDocument: async (uri) => {
            openDocCalls.push(uri.fsPath);
            return {uri, getText: () => ''};
        },
        findFiles: async () => mockUris
    }
});
installVscodeMock(vscode);

// Import the provider to test (after mocking)
const {ThriftDefinitionProvider} = require('../../../out/definition-provider.js');

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
        lineAt: (line) => ({text: 'struct A { 1: MockStruct ms }'}),
        getWordRangeAtPosition: () => ({start: {character: 14}, end: {character: 24}})
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
