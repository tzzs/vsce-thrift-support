const assert = require('assert');
const vscode = require('../../mock_vscode');

const {ThriftRefactorCodeActionProvider} = require('../../../out/code-actions-provider');

function createDocument(text) {
    const lines = text.split('\n');
    return {
        uri: vscode.Uri.file('/tmp/main.thrift'),
        languageId: 'thrift',
        version: 1,
        getText: () => text,
        lineAt: (line) => ({text: lines[line] ?? ''})
    };
}

describe('duplicate field ID quick fix', function () {
    it('suggests replacing duplicate field ID with next available ID', async function () {
        const provider = new ThriftRefactorCodeActionProvider();
        const document = createDocument('struct User {\n  1: string a\n  1: string b\n}\n');
        const diagnosticRange = new vscode.Range(2, 0, 2, 13);

        const actions = await provider.provideCodeActions(
            document,
            diagnosticRange,
            {
                diagnostics: [{
                    range: diagnosticRange,
                    code: 'field.duplicateId',
                    message: 'Duplicate field id 1'
                }]
            },
            {isCancellationRequested: false}
        );

        const fix = actions.find(action => action.title === 'Change duplicate field ID to 2');
        assert.ok(fix);
        assert.strictEqual(fix.edit.edits[0].type, 'replace');
        assert.deepStrictEqual(fix.edit.edits[0].range, new vscode.Range(2, 2, 2, 3));
        assert.strictEqual(fix.edit.edits[0].newText, '2');
    });

    it('suggests changing invalid oneway return type to void', async function () {
        const provider = new ThriftRefactorCodeActionProvider();
        const document = createDocument('service Events {\n  oneway i32 notify(1: string message)\n}\n');
        const diagnosticRange = new vscode.Range(1, 2, 1, 40);

        const actions = await provider.provideCodeActions(
            document,
            diagnosticRange,
            {
                diagnostics: [{
                    range: diagnosticRange,
                    code: 'service.oneway.returnNotVoid',
                    message: 'oneway method must return void'
                }]
            },
            {isCancellationRequested: false}
        );

        const fix = actions.find(action => action.title === 'Change oneway return type to void');
        assert.ok(fix);
        assert.strictEqual(fix.edit.edits[0].type, 'replace');
        assert.deepStrictEqual(fix.edit.edits[0].range, new vscode.Range(1, 9, 1, 12));
        assert.strictEqual(fix.edit.edits[0].newText, 'void');
    });
});
