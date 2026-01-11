const assert = require('assert');
const path = require('path');

const {ThriftReferencesProvider} = require('../../../out/references-provider.js');

describe('references-file-list-incremental', () => {
    let provider;

    beforeEach(() => {
        provider = new ThriftReferencesProvider();
    });

    it('should handle incremental file list updates', async () => {
        const vscode = require('vscode');
        let findFilesCalls = 0;

        const originalFindFiles = vscode.workspace.findFiles;
        vscode.workspace.findFiles = async () => {
            findFilesCalls++;
            return [
                vscode.Uri.file(path.join(__dirname, '..', '..', '..', 'test-files', 'a.thrift')),
                vscode.Uri.file(path.join(__dirname, '..', '..', '..', 'test-files', 'b.thrift'))
            ];
        };

        try {
            const initialFiles = await provider.getThriftFiles();
            assert.strictEqual(findFilesCalls, 1, 'Expected findFiles to be called once');
            assert.strictEqual(initialFiles.length, 2, 'Expected 2 files from initial scan');

            const newFile = vscode.Uri.file(path.join(__dirname, '..', '..', '..', 'test-files', 'extra.thrift'));
            provider.handleFileCreated(newFile);

            const updatedFiles = await provider.getThriftFiles();
            const hasNewFile = updatedFiles.some((file) => file.fsPath === newFile.fsPath);
            assert.ok(hasNewFile, 'Expected new file to be included after create event');
            assert.strictEqual(findFilesCalls, 1, 'Expected no additional findFiles calls');

            const removedFile = initialFiles[0];
            provider.handleFileDeleted(removedFile);
            const afterDelete = await provider.getThriftFiles();
            const stillHasRemoved = afterDelete.some((file) => file.fsPath === removedFile.fsPath);
            assert.ok(!stillHasRemoved, 'Expected deleted file to be removed from file list');
        } finally {
            vscode.workspace.findFiles = originalFindFiles;
        }
    });
});