// RenameProvider unit tests with a minimal VSCode mock
const assert = require('assert');
const {ThriftRenameProvider} = require('../../../out/src/renameProvider.js');

// Mock the references provider to return simple results
const referencesProvider = require('../../../out/src/referencesProvider.js');
const {createVscodeMock, installVscodeMock} = require('../../test-helpers/vscode-mock');
const originalThriftReferencesProvider = referencesProvider.ThriftReferencesProvider;

// Create a simple mock that doesn't require full AST parsing
class MockThriftReferencesProvider {
    async provideReferences(document, position, context, token) {
        const wordRange = document.getWordRangeAtPosition(position, /\b([A-Za-z_][A-Za-z0-9_]*)\b/g);
        if (!wordRange) {
            return [];
        }
        const symbolName = document.getText(wordRange);
        const text = document.getText();
        const lines = text.split('\n');
        const references = [];
        
        // Simple text-based search for symbol occurrences
        for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
            const line = lines[lineIdx];
            const regex = new RegExp(`\\b${symbolName}\\b`, 'g');
            let match;
            while ((match = regex.exec(line)) !== null) {
                references.push({
                    uri: document.uri,
                    range: new vscode.Range(
                        new vscode.Position(lineIdx, match.index),
                        new vscode.Position(lineIdx, match.index + symbolName.length)
                    )
                });
            }
        }
        
        return references;
    }
}

// Replace the references provider with our mock
referencesProvider.ThriftReferencesProvider = MockThriftReferencesProvider;
Module.prototype.require = originalRequire;

function createMockDocument(content) {
    const lines = content.split('\n');
    const lineStartOffsets = [];
    let acc = 0;
    for (let i = 0; i < lines.length; i++) {
        lineStartOffsets.push(acc);
        acc += (lines[i] || '').length + (i < lines.length - 1 ? 1 : 0); // +1 for \n except last
    }
    const offsetAt = (pos) => lineStartOffsets[pos.line] + pos.character;
    const getText = (range) => {
        if (!range) return content;
        const start = offsetAt(range.start);
        const end = offsetAt(range.end);
        return content.slice(start, end);
    };
    const getWordRangeAtPosition = (position, regex) => {
        const line = lines[position.line] || '';
        // Make regex global if it isn't already
        const globalRegex = new RegExp(regex.source, 'g');
        const matches = line.matchAll(globalRegex);
        for (const match of matches) {
            const start = match.index;
            const end = start + match[0].length;
            if (position.character >= start && position.character <= end) {
                return new vscode.Range(
                    new vscode.Position(position.line, start),
                    new vscode.Position(position.line, end)
                );
            }
        }
        return null;
    };
    return {
        uri: {path: '/test.thrift'},
        getText,
        lineCount: lines.length,
        lineAt: (line) => ({text: lines[line] || ''}),
        getWordRangeAtPosition,
    };
}

function applyEditsToContent(content, edits) {
    if (!edits || edits.length === 0) return content;
    const lines = content.split('\n');
    // sort by descending positions to avoid offset shifts
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
            // multi-line (not expected here), implement generic replace
            const before = (lines[start.line] || '').slice(0, start.character);
            const after = (lines[end.line] || '').slice(end.character);
            lines.splice(start.line, end.line - start.line + 1, before + e.newText + after);
        }
    }
    return lines.join('\n');
}

function run() {
    console.log('\nRunning rename provider tests...');

    const content = [
        'struct Foo {',
        '  1: i32 fooName,',
        '  2: string fooName_comment,',
        '  // Also mention fooName here',
        '}',
    ].join('\n');
    const doc = createMockDocument(content);

    const provider = new ThriftRenameProvider();

    // position at 'fooName' on line 1
    const pos = new vscode.Position(1, '  1: i32 '.length + 2); // inside word

    const prep = provider.prepareRename(doc, pos);
    assert.ok(prep && prep.range, 'prepareRename should return a range');
    assert.strictEqual(prep.placeholder, 'fooName', 'Placeholder should equal the symbol text');

    return Promise.resolve(provider.provideRenameEdits(doc, pos, 'barName')).then((we) => {
        assert.ok(we, 'Expected a WorkspaceEdit');
        const a = we.edits || [];
        assert.ok(a.length >= 2, 'Should produce at least two edits (symbol + comment)');

        const newText = applyEditsToContent(content, a);
        assert.ok(newText.includes('barName'), 'New name should appear');
        assert.ok(!/\bfooName\b/.test(newText), 'Old name should be fully replaced');
        assert.ok(newText.includes('fooName_comment'), 'Should NOT replace within larger identifiers');

        console.log('Rename provider tests passed.');
    });
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});
