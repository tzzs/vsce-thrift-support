const assert = require('assert');
const vscode = require('vscode');

const {
    normalizeFormattingRange,
    buildMinimalEdits
} = require('../../../out/formatting-bridge/range-utils.js');

describe('range-utils', () => {
    it('should normalize formatting range to full lines', () => {
        const text = ['struct User {', '  1: i32 id', '}'].join('\n');
        const doc = {
            getText: () => text,
            lineAt: (line) => {
                const lines = text.split('\n');
                return {text: lines[line] || ''};
            }
        };

        const range = {
            start: {line: 0, character: 3},
            end: {line: 1, character: 5}
        };

        const normalized = normalizeFormattingRange(doc, range);

        assert.strictEqual(normalized.start.character, 0);
        assert.strictEqual(normalized.end.character, doc.lineAt(1).text.length);
    });

    it('should build minimal edits', () => {
        const text = 'struct User {\n  1: i32 id\n}';
        const lines = text.split('\n');

        const doc = {
            getText: (range) => {
                if (!range) {
                    return text;
                }
                const {start, end} = range;
                const startOffset =
                    lines.slice(0, start.line).reduce((sum, l) => sum + l.length + 1, 0) +
                    start.character;
                const endOffset =
                    lines.slice(0, end.line).reduce((sum, l) => sum + l.length + 1, 0) +
                    end.character;
                return text.substring(startOffset, endOffset);
            },
            lineAt: (line) => {
                return {text: lines[line] || ''};
            },
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
            },
            offsetAt: (position) => {
                let offset = 0;
                for (let i = 0; i < position.line; i++) {
                    offset += lines[i].length + 1;
                }
                return offset + position.character;
            }
        };

        const original = 'struct User {\n  1: i32 id\n}';
        const formatted = 'struct User {\n  1: i32 id\n}\n';
        const range = {
            start: {line: 0, character: 0},
            end: {line: 2, character: 1}
        };

        const edits = buildMinimalEdits(doc, range, original, formatted);

        assert.strictEqual(edits.length, 1);
    });
});
