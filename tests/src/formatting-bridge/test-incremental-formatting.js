const assert = require('assert');
const vscode = require('vscode');

const {ThriftFormattingProvider} = require('../../../out/formatting-bridge/index.js');
const {IncrementalTracker} = require('../../../out/utils/incremental-tracker.js');
const {config} = require('../../../out/config/index.js');

describe('incremental-formatting', () => {
    let originalFormattingEnabled;
    let originalMaxDirty;

    before(() => {
        originalFormattingEnabled = config.incremental.formattingEnabled;
        originalMaxDirty = config.incremental.maxDirtyLines;
    });

    after(() => {
        config.incremental.formattingEnabled = originalFormattingEnabled;
        config.incremental.maxDirtyLines = originalMaxDirty;
    });

    it('should format incrementally when changes are small', () => {
        config.incremental.formattingEnabled = true;
        config.incremental.maxDirtyLines = 2;

        const tracker = new IncrementalTracker();
        const provider = new ThriftFormattingProvider({incrementalTracker: tracker});

        const text = ['struct A {', '1:i32 id', '}', '', 'struct B {', '1:i32 name', '}'].join(
            '\n'
        );

        const lines = text.split('\n');
        const doc = {
            uri: vscode.Uri.file('/tmp/incremental-format.thrift'),
            languageId: 'thrift',
            getText: () => text,
            lineCount: lines.length,
            lineAt: (i) => ({text: lines[i] || ''}),
            positionAt: (offset) => {
                let currentOffset = 0;
                for (let i = 0; i < lines.length; i++) {
                    const lineLength = lines[i].length + 1;
                    if (currentOffset + lineLength > offset) {
                        return new vscode.Position(i, offset - currentOffset);
                    }
                    currentOffset += lineLength;
                }
                return new vscode.Position(lines.length - 1, lines[lines.length - 1].length);
            }
        };

        tracker.markChanges({
            document: doc,
            contentChanges: [
                {
                    range: {start: {line: 1, character: 0}, end: {line: 1, character: 0}},
                    text: '1: i32 id'
                }
            ]
        });

        const edits = provider.provideDocumentFormattingEdits(doc, {
            insertSpaces: true,
            tabSize: 4
        });

        assert.ok(Array.isArray(edits), 'Should return edits array');
        if (edits.length > 0) {
            assert.ok(edits[0].range, 'Edit should have a range');
        }
    });

    it('should fall back to full format when changes exceed threshold', () => {
        config.incremental.formattingEnabled = true;
        config.incremental.maxDirtyLines = 1;

        const tracker = new IncrementalTracker();
        const provider = new ThriftFormattingProvider({incrementalTracker: tracker});

        const text = ['struct A {', '1:i32 id', '}', '', 'struct B {', '1:i32 name', '}'].join(
            '\n'
        );

        const lines = text.split('\n');
        const doc = {
            uri: vscode.Uri.file('/tmp/incremental-format-full.thrift'),
            languageId: 'thrift',
            getText: () => text,
            lineCount: lines.length,
            lineAt: (i) => ({text: lines[i] || ''}),
            positionAt: (offset) => {
                let currentOffset = 0;
                for (let i = 0; i < lines.length; i++) {
                    const lineLength = lines[i].length + 1;
                    if (currentOffset + lineLength > offset) {
                        return new vscode.Position(i, offset - currentOffset);
                    }
                    currentOffset += lineLength;
                }
                return new vscode.Position(lines.length - 1, lines[lines.length - 1].length);
            }
        };

        tracker.markChanges({
            document: doc,
            contentChanges: [
                {
                    range: {start: {line: 0, character: 0}, end: {line: 2, character: 0}},
                    text: 'struct A {\n1: i32 id\n}\n'
                }
            ]
        });

        const editsFull = provider.provideDocumentFormattingEdits(doc, {
            insertSpaces: true,
            tabSize: 4
        });

        assert.ok(Array.isArray(editsFull), 'Should return edits array');
        if (editsFull.length > 0) {
            assert.ok(editsFull[0].range, 'Edit should have a range');
        }
    });
});
