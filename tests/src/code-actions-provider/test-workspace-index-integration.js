const assert = require('assert');
const vscode = require('vscode');
const {nodes} = require('@tanzz/thrift-core');
const {ThriftRefactorCodeActionProvider} = require('../../../out/code-actions-provider.js');

describe('ThriftRefactorCodeActionProvider WorkspaceIndex integration', function () {
    it('uses injected workspace index to suggest missing includes', async function () {
        const targetUri = vscode.Uri.file('/workspace/models/user.thrift');
        const provider = new ThriftRefactorCodeActionProvider({
            workspaceIndex: {
                getAllSymbols: () => [{
                    name: 'User',
                    kind: nodes.ThriftNodeType.Struct,
                    uri: targetUri,
                    range: new vscode.Range(0, 0, 0, 11),
                    nameRange: new vscode.Range(0, 7, 0, 11)
                }]
            }
        });
        const document = vscode.createTextDocument('struct Local {\n  1: User user\n}\n', vscode.Uri.file('/workspace/main.thrift'));
        document.languageId = 'thrift';
        document.version = 1;
        const diagnosticRange = new vscode.Range(1, 5, 1, 9);

        const actions = await provider.provideCodeActions(
            document,
            diagnosticRange,
            {diagnostics: [{code: 'type.unknown', range: diagnosticRange}]},
            {isCancellationRequested: false}
        );

        const includeAction = actions.find(action => action.title === 'Insert include "models/user.thrift"');
        assert.ok(includeAction);
    });

    it('suggests a namespace alias include only when the namespace match is unique', async function () {
        const targetUri = vscode.Uri.file('/workspace/models/foo.thrift');
        const provider = new ThriftRefactorCodeActionProvider({
            workspaceIndex: {
                getAllSymbols: () => [
                    {
                        name: 'Bar',
                        namespace: 'foo',
                        kind: nodes.ThriftNodeType.Struct,
                        uri: targetUri,
                        range: new vscode.Range(0, 0, 0, 10),
                        nameRange: new vscode.Range(0, 7, 0, 10)
                    },
                    {
                        name: 'Bar',
                        namespace: 'other',
                        kind: nodes.ThriftNodeType.Struct,
                        uri: vscode.Uri.file('/workspace/models/other.thrift'),
                        range: new vscode.Range(0, 0, 0, 10),
                        nameRange: new vscode.Range(0, 7, 0, 10)
                    }
                ]
            }
        });
        const document = vscode.createTextDocument('struct Local {\n  1: foo.Bar item\n}\n', vscode.Uri.file('/workspace/main.thrift'));
        document.languageId = 'thrift';
        document.version = 1;
        const diagnosticRange = new vscode.Range(1, 5, 1, 12);

        const actions = await provider.provideCodeActions(
            document,
            diagnosticRange,
            {diagnostics: [{code: 'type.unknown', range: diagnosticRange}]},
            {isCancellationRequested: false}
        );

        const includeActions = actions.filter(action => action.title.startsWith('Insert include'));
        assert.deepStrictEqual(includeActions.map(action => action.title), ['Insert include "models/foo.thrift"']);
        assert.strictEqual(includeActions[0].isPreferred, true);
    });

    it('does not suggest a namespace alias include when multiple files match the alias and type', async function () {
        const provider = new ThriftRefactorCodeActionProvider({
            workspaceIndex: {
                getAllSymbols: () => [
                    {
                        name: 'Bar',
                        namespace: 'foo',
                        kind: nodes.ThriftNodeType.Struct,
                        uri: vscode.Uri.file('/workspace/models/foo-a.thrift'),
                        range: new vscode.Range(0, 0, 0, 10),
                        nameRange: new vscode.Range(0, 7, 0, 10)
                    },
                    {
                        name: 'Bar',
                        namespace: 'foo',
                        kind: nodes.ThriftNodeType.Struct,
                        uri: vscode.Uri.file('/workspace/models/foo-b.thrift'),
                        range: new vscode.Range(0, 0, 0, 10),
                        nameRange: new vscode.Range(0, 7, 0, 10)
                    }
                ]
            }
        });
        const document = vscode.createTextDocument('struct Local {\n  1: foo.Bar item\n}\n', vscode.Uri.file('/workspace/main.thrift'));
        document.languageId = 'thrift';
        document.version = 1;
        const diagnosticRange = new vscode.Range(1, 5, 1, 12);

        const actions = await provider.provideCodeActions(
            document,
            diagnosticRange,
            {diagnostics: [{code: 'type.unknown', range: diagnosticRange}]},
            {isCancellationRequested: false}
        );

        assert.strictEqual(actions.some(action => action.title.startsWith('Insert include')), false);
    });
});
