const assert = require('assert');
const {ThriftRefactorCodeActionProvider} = require('../../../out/code-actions-provider.js');

describe('CodeActionProvider extended', () => {
    let vscode;

    before(() => {
        vscode = require('vscode');
    });

    function createDoc(languageId, text, wordRange = null) {
        const lines = text.split('\n');
        return {
            languageId,
            uri: vscode.Uri.file('/tmp/test-actions.thrift'),
            getText: (range) => {
                if (!range) return text;
                return text.substring(0, Math.min(text.length, 100));
            },
            lineCount: lines.length,
            lineAt: (line) => ({text: lines[line] || ''}),
            getWordRangeAtPosition: () => wordRange,
            offsetAt: (pos) => 0,
            positionAt: (offset) => new vscode.Position(0, 0)
        };
    }

    it('should return minimum 2 code actions for valid thrift', async () => {
        const provider = new ThriftRefactorCodeActionProvider();
        const doc = createDoc('thrift', 'struct Foo {\n  1: i32 id\n}');
        const range = new vscode.Selection(new vscode.Position(0, 0), new vscode.Position(0, 6));
        const actions = await provider.provideCodeActions(doc, range, {only: undefined}, undefined);
        assert.ok(Array.isArray(actions));
        assert.ok(actions.length >= 2);
    });

    it('should return undefined for non-thrift document', async () => {
        const provider = new ThriftRefactorCodeActionProvider();
        const doc = createDoc('json', '{"key": "value"}');
        const range = new vscode.Selection(new vscode.Position(0, 0), new vscode.Position(0, 6));
        const actions = await provider.provideCodeActions(doc, range, {only: undefined}, undefined);
        assert.strictEqual(actions, undefined);
    });

    it('should return undefined when cancelled', async () => {
        const provider = new ThriftRefactorCodeActionProvider();
        const doc = createDoc('thrift', 'struct Foo {\n  1: i32 id\n}');
        const range = new vscode.Selection(new vscode.Position(0, 0), new vscode.Position(0, 6));
        const token = {isCancellationRequested: true};
        const actions = await provider.provideCodeActions(doc, range, {only: undefined}, token);
        assert.strictEqual(actions, undefined);
    });

    it('should return empty array when lineAt throws', async () => {
        const provider = new ThriftRefactorCodeActionProvider();
        const doc = {
            languageId: 'thrift',
            uri: vscode.Uri.file('/tmp/test-actions.thrift'),
            getText: () => 'struct Foo {',
            lineCount: 1,
            lineAt: () => { throw new Error('lineAt failed'); },
            getWordRangeAtPosition: () => null
        };
        const range = new vscode.Selection(new vscode.Position(0, 0), new vscode.Position(0, 6));
        const actions = await provider.provideCodeActions(doc, range, {only: undefined}, undefined);
        assert.ok(Array.isArray(actions));
        assert.strictEqual(actions.length, 0);
    });

    it('should include code action kinds', () => {
        assert.ok(Array.isArray(ThriftRefactorCodeActionProvider.providedCodeActionKinds));
        assert.ok(ThriftRefactorCodeActionProvider.providedCodeActionKinds.length > 0);
    });

    it('should return include suggestions for unqualified identifiers inside struct', async () => {
        const provider = new ThriftRefactorCodeActionProvider();
        const thriftText = 'include "common.thrift"\n\nstruct Foo {\n  1: MyType val\n}';
        const doc = createDoc('thrift', thriftText, new vscode.Range(3, 5, 3, 11));
        const range = new vscode.Selection(new vscode.Position(3, 8), new vscode.Position(3, 8));
        const actions = await provider.provideCodeActions(doc, range, {only: undefined}, undefined);
        assert.ok(Array.isArray(actions));
    });

    it('should provide actions for struct with namespace references', async () => {
        const provider = new ThriftRefactorCodeActionProvider();
        const thriftText = 'include "shared.thrift"\n\nstruct Foo {\n  1: shared.UserType val\n}';
        const doc = createDoc('thrift', thriftText, new vscode.Range(3, 5, 3, 17));
        const range = new vscode.Selection(new vscode.Position(3, 12), new vscode.Position(3, 12));
        const actions = await provider.provideCodeActions(doc, range, {only: undefined}, undefined);
        assert.ok(Array.isArray(actions));
        assert.ok(actions.length >= 2);
    });
});
