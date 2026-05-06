const path = require('path');
const fs = require('fs');
const assert = require('assert');

const {ThriftFormattingProvider} = require('../../../out/formatting-bridge');

describe('config', () => {
    let vscode;

    before(() => {
        vscode = require('vscode');
    });

    it('should test config formatting', () => {
        const testContent = 'struct User { 1: i32 id; 2: string name; }';

        const mockDocument = {
            uri: {fsPath: 'test-config.thrift'},
            getText: () => testContent,
            lineCount: 1,
            lineAt: (line) => ({text: testContent}),
            languageId: 'thrift'
        };

        const provider = new ThriftFormattingProvider();
        const range = new vscode.Range(
            new vscode.Position(0, 0),
            new vscode.Position(0, testContent.length)
        );

        const edits = provider.provideDocumentRangeFormattingEdits(mockDocument, range, {
            tabSize: 4,
            insertSpaces: true,
            indentSize: 4
        });

        assert.ok(Array.isArray(edits), 'Should return array of edits');
    });
});
