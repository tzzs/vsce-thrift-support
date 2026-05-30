const assert = require('assert');
const vscode = require('../mock_vscode');

describe('extension activation', () => {
    beforeEach(() => {
        vscode.reset();
    });

    afterEach(() => {
        vscode.reset();
    });

    it('registers each command exactly once during activation', () => {
        const registeredCommands = [];

        vscode.commands = {
            registerCommand: (command) => {
                if (registeredCommands.includes(command)) {
                    throw new Error(`duplicate command registration: ${command}`);
                }
                registeredCommands.push(command);
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
            registerCodeActionsProvider: () => ({dispose: () => {}})
        });

        vscode.workspace.onDidChangeConfiguration = () => ({dispose: () => {}});

        const extension = require('../../out/extension.js');
        const context = {subscriptions: []};

        try {
            assert.doesNotThrow(() => extension.activate(context));
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
});
