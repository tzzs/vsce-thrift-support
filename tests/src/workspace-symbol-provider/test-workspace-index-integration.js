const assert = require('assert');
const vscode = require('vscode');
const {nodes} = require('@tanzz/thrift-core');
const {ThriftWorkspaceSymbolProvider} = require('../../../out/workspace-symbol-provider.js');

const mockFileWatcher = {
    createWatcherWithEvents: () => ({
        dispose: () => {
        }
    })
};

function createIndexedSymbol(name, kind, containerName = '') {
    return {
        name,
        kind,
        containerName,
        uri: vscode.Uri.file(`/workspace/${name}.thrift`),
        range: new vscode.Range(0, 0, 0, name.length),
        nameRange: new vscode.Range(0, 0, 0, name.length)
    };
}

function createWorkspaceIndex(symbols) {
    return {
        getAllSymbols: () => symbols,
        findSymbolsByName: (name) => symbols.filter(symbol => symbol.name === name)
    };
}

describe('ThriftWorkspaceSymbolProvider WorkspaceIndex integration', function () {
    it('returns all indexed symbols for an empty query', async function () {
        const symbols = [
            createIndexedSymbol('User', nodes.ThriftNodeType.Struct),
            createIndexedSymbol('UserService', nodes.ThriftNodeType.Service)
        ];
        const provider = new ThriftWorkspaceSymbolProvider({
            fileWatcher: mockFileWatcher,
            workspaceIndex: createWorkspaceIndex(symbols)
        });

        const results = await provider.provideWorkspaceSymbols('', {isCancellationRequested: false});

        assert.deepStrictEqual(results.map(symbol => symbol.name), ['User', 'UserService']);
    });

    it('filters indexed symbols by query', async function () {
        const symbols = [
            createIndexedSymbol('User', nodes.ThriftNodeType.Struct),
            createIndexedSymbol('UserService', nodes.ThriftNodeType.Service),
            createIndexedSymbol('Status', nodes.ThriftNodeType.Enum)
        ];
        const provider = new ThriftWorkspaceSymbolProvider({
            fileWatcher: mockFileWatcher,
            workspaceIndex: createWorkspaceIndex(symbols)
        });

        const results = await provider.provideWorkspaceSymbols('User', {isCancellationRequested: false});

        assert.deepStrictEqual(results.map(symbol => symbol.name), ['User', 'UserService']);
    });

    it('returns an empty result when cancellation is requested', async function () {
        const provider = new ThriftWorkspaceSymbolProvider({
            fileWatcher: mockFileWatcher,
            workspaceIndex: createWorkspaceIndex([
                createIndexedSymbol('User', nodes.ThriftNodeType.Struct)
            ])
        });

        const results = await provider.provideWorkspaceSymbols('', {isCancellationRequested: true});

        assert.deepStrictEqual(results, []);
    });
});
