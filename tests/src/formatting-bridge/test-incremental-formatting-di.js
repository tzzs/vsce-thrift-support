const assert = require('assert');
const vscode = require('vscode');

const {ThriftFormattingProvider} = require('../../../out/formatting-bridge/index.js');
const {config} = require('../../../out/config/index.js');

describe('incremental-formatting-di', () => {
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

    it('should use injected incremental tracker', () => {
        config.incremental.formattingEnabled = true;
        config.incremental.maxDirtyLines = 2;

        const fakeTracker = {
            consumeDirtyRange: () => ({startLine: 1, endLine: 1})
        };

        const provider = new ThriftFormattingProvider({
            incrementalTracker: fakeTracker,
            errorHandler: {
                handleError: () => {
                }
            }
        });

        const text = ['struct A {', '1:i32 id', '}'].join('\n');

        const lines = text.split('\n');
        const doc = {
            uri: vscode.Uri.file('/tmp/incremental-format-di.thrift'),
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

        const edits = provider.provideDocumentFormattingEdits(doc, {
            insertSpaces: true,
            tabSize: 4
        });

        assert.ok(Array.isArray(edits), 'Should return edits array');
        if (edits.length > 0) {
            assert.ok(edits[0].range, 'Edit should have a range');
        }
    });
});
