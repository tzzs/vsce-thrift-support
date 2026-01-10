const assert = require('assert');
const vscode = require('vscode');
const readFileCalls = [];
const openDocCalls = [];
const mockUris = [];

const {ThriftDefinitionProvider} = require('../../../out/definition-provider.js');

describe('scanning-fix', () => {
    it('should pass all test assertions', async () => {
        const provider = new ThriftDefinitionProvider();

        const fileA = vscode.Uri.file('/path/to/A.thrift');
        const fileB = vscode.Uri.file('/path/to/B.thrift');
        mockUris.push(fileB);

        const originalFsReadFile = vscode.workspace.fs.readFile;
        const originalOpenTextDocument = vscode.workspace.openTextDocument;

        vscode.workspace.fs.readFile = async (uri) => {
            readFileCalls.push(uri.fsPath || uri.toString());
            return Buffer.from('struct MockStruct { 1: string name }');
        };

        vscode.workspace.openTextDocument = async (uri) => {
            openDocCalls.push(typeof uri === 'string' ? uri : uri.fsPath);
            return originalOpenTextDocument(uri);
        };

        const docA = {
            uri: fileA,
            getText: () => 'include "B.thrift"\nstruct A { 1: MockStruct ms }',
            languageId: 'thrift',
            lineAt: (line) => ({text: line === 1 ? 'struct A { 1: MockStruct ms }' : 'include "B.thrift"'}),
            getWordRangeAtPosition: () => new vscode.Range(1, 14, 1, 24)
        };

        const pos = new vscode.Position(1, 15);

        try {
            await provider.provideDefinition(docA, pos, {});

            const readFileCalled = readFileCalls.some(p => p.includes('B.thrift'));
            assert.ok(readFileCalled, 'Should verify definition via fs.readFile for workspace files');

            const openDocCalled = openDocCalls.some(p => p.includes('B.thrift'));
            assert.strictEqual(openDocCalled, false, 'Should NOT trigger openTextDocument (which triggers diagnostics) for workspace search');
        } finally {
            vscode.workspace.fs.readFile = originalFsReadFile;
            vscode.workspace.openTextDocument = originalOpenTextDocument;
        }
    });
});