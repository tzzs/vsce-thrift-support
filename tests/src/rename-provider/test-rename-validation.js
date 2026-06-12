const assert = require('assert');
const vscode = require('../../mock_vscode');
const {ThriftRenameProvider} = require('../../../out/rename-provider.js');

function createMockDocument(content, filePath = '/workspace/rename.thrift') {
    const lines = content.split('\n');
    const lineStartOffsets = [];
    let acc = 0;
    for (let i = 0; i < lines.length; i++) {
        lineStartOffsets.push(acc);
        acc += lines[i].length + (i < lines.length - 1 ? 1 : 0);
    }
    const offsetAt = (pos) => lineStartOffsets[pos.line] + pos.character;
    return {
        uri: {fsPath: filePath, toString: () => filePath},
        lineCount: lines.length,
        lineAt: (line) => ({text: lines[line] || ''}),
        getText: (range) => {
            if (!range) return content;
            return content.slice(offsetAt(range.start), offsetAt(range.end));
        },
        getWordRangeAtPosition: (position, regex) => {
            const line = lines[position.line] || '';
            const globalRegex = new RegExp(regex.source, 'g');
            let match;
            while ((match = globalRegex.exec(line)) !== null) {
                const start = match.index;
                const end = start + match[0].length;
                if (position.character >= start && position.character <= end) {
                    return new vscode.Range(new vscode.Position(position.line, start), new vscode.Position(position.line, end));
                }
            }
            return null;
        }
    };
}

describe('rename validation', () => {
    it('rejects primitive and reserved keyword symbols in prepareRename', async () => {
        const doc = createMockDocument('struct User {\n  1: i32 id,\n}');
        const provider = new ThriftRenameProvider();

        await assert.rejects(
            () => Promise.resolve(provider.prepareRename(doc, new vscode.Position(1, 6), {isCancellationRequested: false})),
            /primitive/
        );
    });

    it('rejects top-level rename conflicts before editing', async () => {
        const content = [
            'struct User {',
            '  1: string name,',
            '}',
            'struct Profile {',
            '  1: string name,',
            '}'
        ].join('\n');
        const doc = createMockDocument(content);
        const provider = new ThriftRenameProvider();

        await assert.rejects(
            () => provider.provideRenameEdits(doc, new vscode.Position(0, 8), 'Profile', {isCancellationRequested: false}),
            /conflicts/
        );
    });

    it('rejects field rename conflicts in the same struct', async () => {
        const content = [
            'struct User {',
            '  1: string name,',
            '  2: i32 age,',
            '}'
        ].join('\n');
        const doc = createMockDocument(content);
        const provider = new ThriftRenameProvider();

        await assert.rejects(
            () => provider.provideRenameEdits(doc, new vscode.Position(2, 10), 'name', {isCancellationRequested: false}),
            /conflicts/
        );
    });
});
