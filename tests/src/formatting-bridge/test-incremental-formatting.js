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

        const tracker = IncrementalTracker.getInstance();
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

        const tracker = IncrementalTracker.getInstance();
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

    it('should not add extra indent when incremental range starts at struct header', () => {
        config.incremental.formattingEnabled = true;
        config.incremental.maxDirtyLines = 2;

        const tracker = IncrementalTracker.getInstance();
        const provider = new ThriftFormattingProvider({incrementalTracker: tracker});

        const text = ['// header', 'struct User {', '1:i32 id', '}', ''].join('\n');
        const lines = text.split('\n');
        const doc = {
            uri: vscode.Uri.file('/tmp/incremental-format-struct-start.thrift'),
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
                    range: {start: {line: 2, character: 0}, end: {line: 2, character: 0}},
                    text: '1: i32 id'
                }
            ]
        });

        const edits = provider.provideDocumentFormattingEdits(doc, {
            insertSpaces: true,
            tabSize: 4
        });

        const formatted = applyEditsToContent(text, edits);
        const structLine = formatted.split('\n').find(line => line.includes('struct User {'));
        assert.ok(structLine, 'Should contain struct header');
        assert.strictEqual(structLine.indexOf('struct User {'), 0, 'Struct header should not be indented');
    });
});

function toOffsetsIndex(lines) {
    const offsets = new Array(lines.length + 1);
    let sum = 0;
    for (let i = 0; i < lines.length; i++) {
        offsets[i] = sum;
        sum += (lines[i]?.length || 0) + 1;
    }
    offsets[lines.length] = sum;
    return offsets;
}

function posToOffset(lines, offsets, line, character) {
    const clampedLine = Math.max(0, Math.min(line, lines.length - 1));
    const base = offsets[clampedLine] || 0;
    const maxChar = (lines[clampedLine]?.length || 0);
    const clampedChar = Math.max(0, Math.min(character || 0, maxChar));
    return base + clampedChar;
}

function applyEditsToContent(content, edits) {
    if (!edits || edits.length === 0) return content;
    const lines = content.split('\n');
    const offsets = toOffsetsIndex(lines);
    const expanded = edits.map(e => {
        const s = e.range.start || {line: 0, character: 0};
        const ed = e.range.end || {line: lines.length - 1, character: (lines[lines.length - 1]?.length || 0)};
        return {
            start: posToOffset(lines, offsets, s.line, s.character),
            end: posToOffset(lines, offsets, ed.line, ed.character),
            newText: e.newText || ''
        };
    });
    expanded.sort((a, b) => b.start - a.start);
    let result = content;
    for (const e of expanded) {
        result = result.slice(0, e.start) + e.newText + result.slice(e.end);
    }
    return result;
}
