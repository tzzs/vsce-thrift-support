const assert = require('assert');
const vscode = require('../mock_vscode');

describe('extension activation', () => {
    beforeEach(() => {
        vscode.reset();
        clearExtensionModuleCache();
    });

    afterEach(() => {
        vscode.reset();
        clearExtensionModuleCache();
    });

    it('registers each command exactly once during activation', async () => {
        const registeredCommands = [];

        installActivationStubs((command) => {
            if (registeredCommands.includes(command)) {
                throw new Error(`duplicate command registration: ${command}`);
            }
            registeredCommands.push(command);
        });

        const extension = require('../../out/extension.js');
        const context = {subscriptions: []};

        try {
            await extension.activate(context);
            assert.strictEqual(
                registeredCommands.filter(command => command === 'thrift.showPerformanceReport').length,
                1
            );
            assert.strictEqual(
                registeredCommands.filter(command => command === 'thrift.showMemoryReport').length,
                1
            );
        } finally {
            for (const subscription of context.subscriptions) {
                if (subscription && typeof subscription.dispose === 'function') {
                    subscription.dispose();
                }
            }
        }
    });

    it('creates, refreshes, and disposes a shared workspace index during activation', async () => {
        const {createCoreDependencies} = require('../../out/utils/dependencies.js');
        const deps = createCoreDependencies();

        assert.ok(deps.workspaceIndex, 'createCoreDependencies should provide workspaceIndex');
        assert.strictEqual(typeof deps.workspaceIndex.refresh, 'function');
        assert.strictEqual(typeof deps.workspaceIndex.dispose, 'function');
        deps.workspaceIndex.dispose();

        const {WorkspaceIndex} = require('../../out/indexing/workspace-index.js');
        const originalRefresh = WorkspaceIndex.prototype.refresh;
        const originalDispose = WorkspaceIndex.prototype.dispose;
        let refreshCount = 0;
        let disposeCount = 0;

        WorkspaceIndex.prototype.refresh = async function () {
            refreshCount += 1;
        };
        WorkspaceIndex.prototype.dispose = function () {
            disposeCount += 1;
        };

        installActivationStubs();

        const extension = require('../../out/extension.js');
        const context = {subscriptions: []};
        let disposed = false;

        try {
            await extension.activate(context);
            assert.strictEqual(refreshCount, 1, 'activate should refresh workspaceIndex once');

            disposeSubscriptions(context);
            disposed = true;

            assert.strictEqual(disposeCount, 1, 'workspaceIndex should be disposed via context subscriptions');
        } finally {
            if (!disposed) {
                disposeSubscriptions(context);
            }
            WorkspaceIndex.prototype.refresh = originalRefresh;
            WorkspaceIndex.prototype.dispose = originalDispose;
        }
    });
});

function disposeSubscriptions(context) {
    for (const subscription of context.subscriptions) {
        if (subscription && typeof subscription.dispose === 'function') {
            subscription.dispose();
        }
    }
}

function installActivationStubs(onCommand) {
    vscode.commands = {
        registerCommand: (command) => {
            if (onCommand) {
                onCommand(command);
            }
            return {dispose: () => {}};
        }
    };

    Object.assign(vscode.languages, {
        registerDocumentFormattingEditProvider: () => ({dispose: () => {}}),
        registerDocumentRangeFormattingEditProvider: () => ({dispose: () => {}}),
        registerDefinitionProvider: () => ({dispose: () => {}}),
        registerHoverProvider: () => ({dispose: () => {}}),
        registerCompletionItemProvider: () => ({dispose: () => {}}),
        registerDocumentSymbolProvider: () => ({dispose: () => {}}),
        registerWorkspaceSymbolProvider: () => ({dispose: () => {}}),
        registerReferenceProvider: () => ({dispose: () => {}}),
        registerFoldingRangeProvider: () => ({dispose: () => {}}),
        registerSelectionRangeProvider: () => ({dispose: () => {}}),
        registerRenameProvider: () => ({dispose: () => {}}),
        registerInlayHintsProvider: () => ({dispose: () => {}}),
        registerCodeLensProvider: () => ({dispose: () => {}}),
        registerCodeActionsProvider: () => ({dispose: () => {}})
    });

    vscode.workspace.onDidChangeConfiguration = () => ({dispose: () => {}});
}

function clearExtensionModuleCache() {
    for (const request of [
        '../../out/extension.js',
        '../../out/setup.js',
        '../../out/utils/dependencies.js',
        '../../out/indexing/workspace-index.js'
    ]) {
        try {
            delete require.cache[require.resolve(request)];
        } catch {
            // Module may not have been loaded yet.
        }
    }
}
