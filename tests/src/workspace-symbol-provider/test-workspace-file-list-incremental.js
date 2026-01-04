const path = require('path');

const {createVscodeMock, installVscodeMock} = require('../../mock_vscode.js');

let findFilesCalls = 0;

const vscode = createVscodeMock({
    workspace: {
        findFiles: async () => {
            findFilesCalls += 1;
            return [
                vscode.Uri.file(path.join(__dirname, '..', '..', 'test-files', 'file1.thrift')),
                vscode.Uri.file(path.join(__dirname, '..', '..', 'test-files', 'file2.thrift'))
            ];
        },
        createFileSystemWatcher: () => new vscode.FileSystemWatcher(),
        textDocuments: []
    },
    FileSystemWatcher: class {
        constructor() {
            this._createListeners = [];
            this._changeListeners = [];
            this._deleteListeners = [];

            this.onDidCreate = (listener) => {
                this._createListeners.push(listener);
                return {dispose: () => {}};
            };
            this.onDidChange = (listener) => {
                this._changeListeners.push(listener);
                return {dispose: () => {}};
            };
            this.onDidDelete = (listener) => {
                this._deleteListeners.push(listener);
                return {dispose: () => {}};
            };
        }

        fireCreate(uri) {
            this._createListeners.forEach(listener => listener(uri));
        }

        fireDelete(uri) {
            this._deleteListeners.forEach(listener => listener(uri));
        }
    }
});
installVscodeMock(vscode);

const {ThriftWorkspaceSymbolProvider} = require('../../../out/workspace-symbol-provider.js');

async function testIncrementalFileListUpdates() {
    console.log('Testing workspace file list incremental updates...');

    const provider = new ThriftWorkspaceSymbolProvider();

    const initialFiles = await provider.getThriftFiles();
    if (findFilesCalls !== 1) {
        throw new Error(`Expected findFiles to be called once, got ${findFilesCalls}`);
    }
    if (initialFiles.length !== 2) {
        throw new Error(`Expected 2 files from initial scan, got ${initialFiles.length}`);
    }

    const watcher = provider.fileWatcher;
    if (!watcher || typeof watcher.fireCreate !== 'function') {
        throw new Error('Expected test watcher with fireCreate method');
    }

    const newFile = vscode.Uri.file(path.join(__dirname, '..', '..', 'test-files', 'new-file.thrift'));
    watcher.fireCreate(newFile);

    const updatedFiles = await provider.getThriftFiles();
    const hasNewFile = updatedFiles.some((file) => file.fsPath === newFile.fsPath);
    if (!hasNewFile) {
        throw new Error('Expected new file to be included after create event');
    }
    if (findFilesCalls !== 1) {
        throw new Error(`Expected no additional findFiles calls, got ${findFilesCalls}`);
    }

    const removedFile = initialFiles[0];
    watcher.fireDelete(removedFile);
    const afterDelete = await provider.getThriftFiles();
    const stillHasRemoved = afterDelete.some((file) => file.fsPath === removedFile.fsPath);
    if (stillHasRemoved) {
        throw new Error('Expected deleted file to be removed from file list');
    }

    console.log('✓ Incremental file list update test passed');
}

testIncrementalFileListUpdates().catch((error) => {
    console.error('❌ Incremental file list update test failed:', error.message);
    process.exit(1);
});
