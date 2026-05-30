const assert = require('assert');
const vscode = require('../../mock_vscode');

const {ThriftCompletionProvider} = require('../../../out/completion/provider');

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

describe('completion provider editor UX', function () {
    it('suggests workspace and namespaced types in type contexts', async function () {
        const provider = new ThriftCompletionProvider({
            workspaceIndex: {
                getAllSymbols: () => [
                    {
                        name: 'RemoteUser',
                        namespace: 'shared',
                        uri: vscode.Uri.file('/tmp/shared.thrift')
                    }
                ]
            }
        });
        const document = createDocument('struct Local {\n  1: optional \n}\n');

        const items = await provider.provideCompletionItems(
            document,
            new vscode.Position(1, '  1: optional '.length),
            {isCancellationRequested: false},
            {}
        );
        const labels = items.map(item => item.label);

        assert.ok(labels.includes('RemoteUser'));
        assert.ok(labels.includes('shared.RemoteUser'));
    });

    it('deduplicates workspace type completions by label', async function () {
        const provider = new ThriftCompletionProvider({
            workspaceIndex: {
                getAllSymbols: () => [
                    {
                        name: 'RemoteUser',
                        namespace: 'shared',
                        uri: vscode.Uri.file('/tmp/shared-a.thrift')
                    },
                    {
                        name: 'RemoteUser',
                        namespace: 'shared',
                        uri: vscode.Uri.file('/tmp/shared-b.thrift')
                    }
                ]
            }
        });
        const document = createDocument('struct Local {\n  1: optional \n}\n');

        const items = await provider.provideCompletionItems(
            document,
            new vscode.Position(1, '  1: optional '.length),
            {isCancellationRequested: false},
            {}
        );
        const labels = items.map(item => item.label);

        assert.strictEqual(labels.filter(label => label === 'RemoteUser').length, 1);
        assert.strictEqual(labels.filter(label => label === 'shared.RemoteUser').length, 1);
    });

    it('suggests annotation keys and values inside annotation context', async function () {
        const provider = new ThriftCompletionProvider();
        const keyDocument = createDocument('struct Local {\n  1: string name (\n}\n');
        const valueDocument = createDocument('struct Local {\n  1: string name (deprecated = \n}\n');

        const keyItems = await provider.provideCompletionItems(
            keyDocument,
            new vscode.Position(1, '  1: string name ('.length),
            {isCancellationRequested: false},
            {}
        );
        const valueItems = await provider.provideCompletionItems(
            valueDocument,
            new vscode.Position(1, '  1: string name (deprecated = '.length),
            {isCancellationRequested: false},
            {}
        );

        assert.ok(keyItems.map(item => item.label).includes('go.tag'));
        assert.ok(valueItems.map(item => item.label).includes('true'));
    });
});
