const assert = require('assert');

describe('test module resolution', function () {
    it('loads representative core modules through out path remapping', function () {
        const core = require('../../../out/ast/parser');
        const cache = require('../../../out/utils/cache-manager');

        assert.strictEqual(typeof core.ThriftParser, 'function');
        assert.strictEqual(typeof cache.CacheManager, 'function');
    });

    it('loads representative vscode modules through root out path', function () {
        const definition = require('../../../out/definition-provider');
        const workspaceSymbols = require('../../../out/workspace-symbol-provider');

        assert.strictEqual(typeof definition.ThriftDefinitionProvider, 'function');
        assert.strictEqual(typeof workspaceSymbols.ThriftWorkspaceSymbolProvider, 'function');
    });

    it('does not load duplicate cache-manager modules through package and remapped paths', function () {
        const remapped = require('../../../out/utils/cache-manager');
        const fromPackage = require('@tanzz/thrift-core');

        assert.strictEqual(remapped.CacheManager, fromPackage.CacheManager);
    });
});
