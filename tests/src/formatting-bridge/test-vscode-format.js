const path = require('path');
const fs = require('fs');
const assert = require('assert');

const {ThriftFormattingProvider} = require('../../../out/formatting-bridge/index.js');

describe('vscode-format', () => {
    let vscode;

    before(() => {
        vscode = require('vscode');
    });

    it('should execute VSCode formatting', async () => {
        const provider = new ThriftFormattingProvider();
        const examplePath = path.join(__dirname, '..', '..', 'test-files', 'example.thrift');

        const text = fs.readFileSync(examplePath, 'utf8');
        const lines = text.split('\n');

        const doc = {
            uri: {fsPath: examplePath},
            getText: () => text,
            lineAt: (line) => ({text: lines[line] || ''})
        };

        const fullRange = {
            start: {line: 0, character: 0},
            end: {line: 1000, character: 0}
        };

        const edits = await provider.provideDocumentRangeFormattingEdits(doc, fullRange, {
            tabSize: 2,
            insertSpaces: true
        }, {});

        assert.ok(Array.isArray(edits), 'Should return an array of edits');
    });
});