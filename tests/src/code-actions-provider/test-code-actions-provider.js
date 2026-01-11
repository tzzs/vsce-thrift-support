// CodeActionProvider unit tests with a minimal VSCode mock
require('../../require-hook');
const assert = require('assert');
const {ThriftRefactorCodeActionProvider} = require('../../../out/code-actions-provider.js');
describe('test-code-actions-provider', function () {
    it('should run successfully', async function () {
        function createDoc(languageId = 'thrift', text = 'struct Foo {\n 1: i32 id\n}') {
            const lines = text.split('\n');
            return {
                languageId,
                getText: () => text,
                lineCount: lines.length,
                lineAt: (line) => ({text: lines[line] || ''}),
                // Avoid triggering workspace search in provider
                getWordRangeAtPosition: () => null,
            };
        }

        async function run() {
            const vscode = require('vscode');
            const provider = new ThriftRefactorCodeActionProvider();

            const doc = createDoc('thrift');
            const range = new vscode.Selection(new vscode.Position(0, 0), new vscode.Position(0, 6));
            const actions = (await provider.provideCodeActions(doc, range, {only: undefined}, undefined)) || [];

            assert.ok(Array.isArray(actions), 'Expected an array of code actions');
            assert.strictEqual(actions.length, 2, 'Should return two code actions');

            const [extract, move] = actions;
            assert.strictEqual(extract.title, 'Extract type (typedef)');
            assert.strictEqual(extract.kind, vscode.CodeActionKind.RefactorExtract);
            assert.ok(extract.command && extract.command.command === 'thrift.refactor.extractType');

            assert.strictEqual(move.title, 'Move type to file...');
            assert.strictEqual(move.kind, vscode.CodeActionKind.RefactorMove);
            assert.ok(move.command && move.command.command === 'thrift.refactor.moveType');

            // Non-thrift docs should return undefined
            const otherDoc = createDoc('json');
            const none = await provider.provideCodeActions(otherDoc, range, {only: undefined}, undefined);
            assert.strictEqual(none, undefined, 'Non-thrift documents should not provide code actions');

        }

        await run();
    });
});
