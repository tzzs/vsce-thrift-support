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

    it('drops include paths that escape the workspace root', async function () {
        const {WorkspaceIndex} = require('../../../out/indexing/workspace-index');

        const files = new Map([
            ['/workspace/service.thrift', 'include "../outside.thrift"\ninclude "/etc/passwd"\ninclude "shared.thrift"\nservice UserService { void ping() }\n'],
            ['/workspace/shared.thrift', 'struct Shared { 1: string name }\n']
        ]);
        const reads = [];

        const index = new WorkspaceIndex({
            workspaceFolders: [vscode.Uri.file('/workspace')],
            findFiles: async () => [vscode.Uri.file('/workspace/service.thrift')],
            readFile: async uri => {
                reads.push(uri.fsPath);
                return files.get(uri.fsPath) || '';
            },
            createWatcher: () => ({dispose() {}})
        });

        await index.refresh();

        const includes = index.getIncludedUris(vscode.Uri.file('/workspace/service.thrift'));
        assert.deepStrictEqual(includes.map(uri => uri.fsPath), ['/workspace/shared.thrift']);

        const liveIncludes = index.getIncludedUrisForText(
            vscode.Uri.file('/workspace/service.thrift'),
            files.get('/workspace/service.thrift'),
            2
        );
        assert.deepStrictEqual(liveIncludes.map(uri => uri.fsPath), ['/workspace/shared.thrift']);

        await index.getText(includes[0]);
        assert.deepStrictEqual(reads.sort(), ['/workspace/service.thrift', '/workspace/shared.thrift'].sort());
    });

    it('limits default workspace indexing to the configured file budget', async function () {
        const {WorkspaceIndex} = require('../../../out/indexing/workspace-index');
        const originalFindFiles = vscode.workspace.findFiles;
        const calls = [];

        vscode.workspace.findFiles = async (include, exclude, maxResults) => {
            calls.push({include, exclude, maxResults});
            return [];
        };

        try {
            const index = new WorkspaceIndex({createWatcher: () => ({dispose() {}})});
            await index.refresh();
        } finally {
            vscode.workspace.findFiles = originalFindFiles;
        }

        assert.strictEqual(calls.length, 1);
        assert.strictEqual(typeof calls[0].maxResults, 'number');
        assert.ok(calls[0].maxResults > 0, 'maxResults should be a positive bound');
    });
});
