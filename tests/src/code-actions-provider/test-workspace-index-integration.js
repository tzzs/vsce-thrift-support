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
});
