const assert = require('assert');
const path = require('path');

const mockVscode = require('../../mock_vscode');
const {Range, Position} = mockVscode;

const Module = require('module');
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
    if (request === 'vscode') return mockVscode;
    return originalLoad.apply(this, arguments);
};

const {ThriftRenameProvider} = require('../../../out/renameProvider.js');

function createMockDocument(content, filePath) {
    const lines = content.split('\n');
    const lineStartOffsets = [];
    let acc = 0;
    for (let i = 0; i < lines.length; i++) {
        lineStartOffsets.push(acc);
        acc += lines[i].length + (i < lines.length - 1 ? 1 : 0);
    }

    const offsetAt = (pos) => lineStartOffsets[pos.line] + pos.character;

    return {
        uri: {fsPath: filePath},
        lineCount: lines.length,
        lineAt: (line) => ({text: lines[line] || ''}),
        getText: (range) => {
            if (!range) {
                return content;
            }
            const start = offsetAt(range.start);
            const end = offsetAt(range.end);
            return content.slice(start, end);
        },
        getWordRangeAtPosition: (position, regex) => {
            const line = lines[position.line] || '';
            const globalRegex = new RegExp(regex.source, 'g');
            let match;
            while ((match = globalRegex.exec(line)) !== null) {
                const start = match.index;
                const end = start + match[0].length;
                if (position.character >= start && position.character <= end) {
                    return new Range(new Position(position.line, start), new Position(position.line, end));
                }
            }
            return null;
        }
    };
}

function applyEditsToContent(content, edits) {
    if (!edits || edits.length === 0) return content;
    const lines = content.split('\n');
    const sorted = edits.slice().sort((a, b) => {
        if (a.range.start.line !== b.range.start.line) return b.range.start.line - a.range.start.line;
        return b.range.start.character - a.range.start.character;
    });
    for (const e of sorted) {
        const {start, end} = e.range;
        if (start.line === end.line) {
            const line = lines[start.line] || '';
            lines[start.line] = line.slice(0, start.character) + e.newText + line.slice(end.character);
        } else {
            const before = (lines[start.line] || '').slice(0, start.character);
            const after = (lines[end.line] || '').slice(end.character);
            lines.splice(start.line, end.line - start.line + 1, before + e.newText + after);
        }
    }
    return lines.join('\n');
}

function run() {
    console.log('\nRunning rename provider regression test...');

    const content = [
        'struct User {',
        '  1: i32 id,',
        '}',
        '',
        'service UserService {',
        '  User getUser(1: i32 id)',
        '}'
    ].join('\n');

    const filePath = path.join(__dirname, 'test-files', 'rename-regression.thrift');
    const doc = createMockDocument(content, filePath);

    mockVscode.workspace = {
        findFiles: async () => [],
        textDocuments: [doc],
        openTextDocument: async (uri) => {
            if (uri && uri.fsPath === filePath) {
                return doc;
            }
            throw new Error('Unexpected document request');
        }
    };

    const provider = new ThriftRenameProvider();
    const pos = new Position(0, 'struct '.length + 1); // inside User

    return Promise.resolve(provider.provideRenameEdits(doc, pos, 'Account')).then((we) => {
        assert.ok(we, 'Expected a WorkspaceEdit');
        const edits = we.edits || [];
        assert.ok(edits.length >= 2, 'Should update definition and reference');

        const newText = applyEditsToContent(content, edits);
        assert.ok(newText.includes('struct Account {'), 'Definition should be renamed without deleting the struct');
        assert.ok(newText.includes('service UserService {'), 'Service definition should remain intact');
        assert.ok(newText.includes('  1: i32 id,'), 'Struct body should remain intact');
        assert.ok(newText.includes('  Account getUser(1: i32 id)'), 'Reference should be renamed');

        console.log('Rename provider regression test passed.');
    });
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});
