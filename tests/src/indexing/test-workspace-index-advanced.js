const assert = require('assert');
const vscode = require('../../mock_vscode');

describe('WorkspaceIndex advanced behavior', function () {
    it('resolves namespaces, includes, file text, and invalidation from indexed files', async function () {
        const {WorkspaceIndex} = require('../../../out/indexing/workspace-index');

        const files = new Map([
            ['/workspace/main.thrift', 'include "models.thrift"\nstruct Local { 1: models.User user }\n'],
            ['/workspace/models.thrift', 'namespace js models\nstruct User { 1: string name }\n']
        ]);
        let readCount = 0;

        const index = new WorkspaceIndex({
            findFiles: async () => Array.from(files.keys()).map(file => vscode.Uri.file(file)),
            readFile: async uri => {
                readCount += 1;
                return files.get(uri.fsPath) || '';
            },
            createWatcher: () => ({dispose() {}})
        });

        await index.refresh();

        const mainUri = vscode.Uri.file('/workspace/main.thrift');
        const modelsUri = vscode.Uri.file('/workspace/models.thrift');
        const namespaced = index.findSymbolsByNameAndNamespace('User', 'models');
        const includeUris = index.getIncludedUris(mainUri);
        const includeLocation = index.findIncludeForNamespace(mainUri, 'models');

        assert.strictEqual(namespaced.length, 1);
        assert.strictEqual(namespaced[0].uri.toString(), modelsUri.toString());
        assert.deepStrictEqual(includeUris.map(uri => uri.toString()), [modelsUri.toString()]);
        assert.ok(includeLocation);
        assert.strictEqual(includeLocation.uri.toString(), mainUri.toString());
        assert.strictEqual(await index.getText(modelsUri), files.get('/workspace/models.thrift'));

        const readCountAfterWarmLookup = readCount;
        assert.strictEqual(await index.getText(modelsUri), files.get('/workspace/models.thrift'));
        assert.strictEqual(readCount, readCountAfterWarmLookup);

        index.invalidate(modelsUri);
        files.set('/workspace/models.thrift', 'namespace js models\nstruct User { 1: string renamed }\n');
        assert.strictEqual(await index.getText(modelsUri), files.get('/workspace/models.thrift'));
        assert.ok(readCount > readCountAfterWarmLookup);
    });
});
