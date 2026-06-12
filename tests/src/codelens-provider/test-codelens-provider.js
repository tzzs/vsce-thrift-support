require('../../require-hook');
const assert = require('assert');
const vscode = require('vscode');
const {ThriftCodeLensProvider} = require('../../../out/codelens-provider.js');

function createDoc(text, fsPath = '/workspace/main.thrift') {
    const lines = text.split('\n');
    return {
        uri: vscode.Uri.file(fsPath),
        languageId: 'thrift',
        version: 1,
        getText: () => text,
        lineAt: (line) => ({text: lines[line] || ''}),
        lineCount: lines.length
    };
}

function createWorkspaceIndex(files) {
    const docs = files.map(file => createDoc(file.text, file.path));
    return {
        getAllFiles: () => docs.map(doc => doc.uri),
        getText: async (uri) => {
            const doc = docs.find(candidate => candidate.uri.toString() === uri.toString());
            if (!doc) {
                throw new Error(`missing doc ${uri.toString()}`);
            }
            return doc.getText();
        }
    };
}

describe('codelens provider', () => {
    it('adds reference lenses for top-level types and excludes fields', async () => {
        const text = [
            'struct User {',
            '  1: string name',
            '}',
            'service ProfileService {',
            '  User get(1: User request)',
            '}'
        ].join('\n');
        const doc = createDoc(text);
        const provider = new ThriftCodeLensProvider({workspaceIndex: createWorkspaceIndex([{path: '/workspace/main.thrift', text}])});

        const lenses = await provider.provideCodeLenses(doc, {isCancellationRequested: false});
        const titles = lenses.map(lens => lens.command.title);

        assert.ok(titles.includes('2 references'));
        assert.ok(!titles.some(title => title.includes('name')));
    });

    it('adds override lenses for service methods across transitive children', async () => {
        const files = [
            {
                path: '/workspace/base.thrift',
                text: 'service Base {\n  void ping()\n}'
            },
            {
                path: '/workspace/child.thrift',
                text: 'include "base.thrift"\nservice Child extends Base {\n  void ping()\n}'
            },
            {
                path: '/workspace/grand.thrift',
                text: 'include "child.thrift"\nservice GrandChild extends Child {\n  void ping()\n}'
            }
        ];
        const doc = createDoc(files[0].text, files[0].path);
        const provider = new ThriftCodeLensProvider({workspaceIndex: createWorkspaceIndex(files)});

        const lenses = await provider.provideCodeLenses(doc, {isCancellationRequested: false});
        const overrideLens = lenses.find(lens => lens.command.title === '2 overrides');

        assert.ok(overrideLens, 'expected override count lens');
        assert.strictEqual(overrideLens.command.command, 'editor.action.showReferences');
        assert.strictEqual(overrideLens.command.arguments[2].length, 2);
    });

    it('returns no lenses when cancelled', async () => {
        const doc = createDoc('struct User {\n}');
        const provider = new ThriftCodeLensProvider();

        const lenses = await provider.provideCodeLenses(doc, {isCancellationRequested: true});

        assert.deepStrictEqual(lenses, []);
    });
});
