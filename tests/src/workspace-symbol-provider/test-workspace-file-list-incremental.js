const assert = require('assert');
const path = require('path');
const vscode = require('vscode');

const {ThriftWorkspaceSymbolProvider} = require('../../../out/workspace-symbol-provider.js');

// Mock file watcher with test methods
const createTestFileWatcher = () => {
    const watchers = [];
    return {
        createWatcherWithEvents: (pattern, handlers) => {
            const watcher = {
                dispose: () => {
                },
                fireCreate: (uri) => handlers.onCreate?.(uri),
                fireDelete: (uri) => handlers.onDelete?.(uri),
                fireChange: (uri) => handlers.onChange?.(uri)
            };
            watchers.push(watcher);
            return watcher;
        },
        getAllWatchers: () => watchers
    };
};

describe('workspace-file-list-incremental', () => {
    it('should handle incremental file list updates', async () => {
        let findFilesCalls = 0;

        const originalFindFiles = vscode.workspace.findFiles;
        vscode.workspace.findFiles = async () => {
            findFilesCalls++;
            return [
                vscode.Uri.file(path.join(__dirname, '..', '..', 'test-files', 'a.thrift')),
                vscode.Uri.file(path.join(__dirname, '..', '..', 'test-files', 'b.thrift'))
            ];
        };

        try {
            const testFileWatcher = createTestFileWatcher();
            const provider = new ThriftWorkspaceSymbolProvider({fileWatcher: testFileWatcher});

            // Trigger initial file scan via provideWorkspaceSymbols
            const initialSymbols = await provider.provideWorkspaceSymbols('', {isCancellationRequested: false});
            assert.strictEqual(findFilesCalls, 1, 'Expected findFiles to be called once');
            assert.ok(Array.isArray(initialSymbols), 'Expected symbols array');

            // Get the watcher that was created
            const watchers = testFileWatcher.getAllWatchers();
            assert.strictEqual(watchers.length, 1, 'Expected one watcher to be created');
            const watcher = watchers[0];

            const newFile = vscode.Uri.file(path.join(__dirname, '..', '..', 'test-files', 'new-file.thrift'));
            watcher.fireCreate(newFile);

            // After create, file list should be updated without calling findFiles again
            const afterCreate = await provider.provideWorkspaceSymbols('', {isCancellationRequested: false});
            assert.ok(Array.isArray(afterCreate), 'Expected symbols after create');
            // Since cache was cleared, it should scan again
            assert.ok(findFilesCalls >= 1, 'Expected findFiles to be called');

            // Test delete
            watcher.fireDelete(newFile);
            const afterDelete = await provider.provideWorkspaceSymbols('', {isCancellationRequested: false});
            assert.ok(Array.isArray(afterDelete), 'Expected symbols after delete');
        } finally {
            vscode.workspace.findFiles = originalFindFiles;
        }
    });
});
