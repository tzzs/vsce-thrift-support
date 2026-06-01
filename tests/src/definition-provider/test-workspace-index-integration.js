const assert = require('assert');
const vscode = require('vscode');
const {nodes} = require('@tanzz/thrift-core');
const {ThriftDefinitionProvider} = require('../../../out/definition-provider.js');

describe('ThriftDefinitionProvider WorkspaceIndex integration', function () {
    it('uses injected workspace index for workspace fallback definitions', async function () {
        const targetUri = vscode.Uri.file('/workspace/models.thrift');
        const provider = new ThriftDefinitionProvider({
            workspaceIndex: {
                getIncludedUris: () => [],
                findSymbolsByName: name => name === 'User'
                    ? [{
                        name: 'User',
                        kind: nodes.ThriftNodeType.Struct,
                        uri: targetUri,
                        range: new vscode.Range(1, 0, 1, 11),
                        nameRange: new vscode.Range(1, 7, 1, 11)
                    }]
                    : []
            }
        });
        const document = vscode.createTextDocument('struct Local { 1: User user }\n', vscode.Uri.file('/workspace/main.thrift'));
        document.languageId = 'thrift';
        document.version = 1;

        const position = new vscode.Position(0, 18);
        const result = await provider.provideDefinition(document, position, {isCancellationRequested: false});

        assert.ok(Array.isArray(result));
        assert.strictEqual(result.length, 1);
        assert.strictEqual(result[0].uri.toString(), targetUri.toString());
    });

    it('does not use workspace fallback for missing namespaced types when include exists', async function () {
        const mainUri = vscode.Uri.file('/workspace/main.thrift');
        const includeUri = vscode.Uri.file('/workspace/models.thrift');
        const fallbackUri = vscode.Uri.file('/workspace/other.thrift');
        const provider = new ThriftDefinitionProvider({
            workspaceIndex: {
                getIncludedUris: () => [includeUri],
                getText: async () => 'struct Present { 1: i32 id }\n',
                findIncludeForNamespace: () => new vscode.Location(mainUri, new vscode.Range(0, 0, 0, 23)),
                findSymbolsByNameAndNamespace: name => name === 'Missing'
                    ? [{
                        name: 'Missing',
                        kind: nodes.ThriftNodeType.Struct,
                        uri: fallbackUri,
                        range: new vscode.Range(1, 0, 1, 16),
                        nameRange: new vscode.Range(1, 7, 1, 14)
                    }]
                    : [],
                findSymbolsByName: () => []
            }
        });
        const document = vscode.createTextDocument(
            [
                'include "models.thrift"',
                'struct Local {',
                '  1: models.Missing value',
                '}'
            ].join('\n'),
            mainUri
        );
        document.languageId = 'thrift';
        document.version = 1;

        const result = await provider.provideDefinition(
            document,
            new vscode.Position(2, 14),
            {isCancellationRequested: false}
        );

        assert.strictEqual(result, undefined);
    });
});
