const assert = require('assert');
const vscode = require('../../mock_vscode');

describe('WorkspaceIndex', function () {
    it('indexes top-level thrift symbols from workspace files', async function () {
        const {WorkspaceIndex} = require('../../../out/indexing/workspace-index');

        const files = new Map([
            ['/workspace/base.thrift', 'namespace js base\nstruct User { 1: string name }\n'],
            ['/workspace/service.thrift', 'include "base.thrift"\nservice UserService { void ping() }\n']
        ]);

        const index = new WorkspaceIndex({
            findFiles: async () => Array.from(files.keys()).map(file => vscode.Uri.file(file)),
            readFile: async uri => files.get(uri.fsPath) || '',
            createWatcher: () => ({dispose() {}})
        });

        await index.refresh();

        const user = index.findSymbolsByName('User');
        const service = index.findSymbolsByName('UserService');

        assert.strictEqual(user.length, 1);
        assert.strictEqual(service.length, 1);
        assert.strictEqual(user[0].name, 'User');
        assert.strictEqual(service[0].name, 'UserService');
    });
});
