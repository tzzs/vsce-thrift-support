const path = require('path');

const {createVscodeMock, installVscodeMock} = require('../../mock_vscode.js');

let findFilesCalls = 0;

const vscode = createVscodeMock({
    workspace: {
        findFiles: async () => {
            findFilesCalls += 1;
            return [
                vscode.Uri.file(path.join(__dirname, 'test-files', 'main.thrift')),
                vscode.Uri.file(path.join(__dirname, 'test-files', 'shared.thrift'))
            ];
        },
        textDocuments: []
    }
});
installVscodeMock(vscode);

const {ThriftReferencesProvider} = require('../../../out/references-provider.js');

async function testIncrementalFileListUpdates() {
    console.log('Testing references provider incremental file list updates...');

    const provider = new ThriftReferencesProvider();

    const initialFiles = await provider.getThriftFiles();
    if (findFilesCalls !== 1) {
        throw new Error(`Expected findFiles to be called once, got ${findFilesCalls}`);
    }
    if (initialFiles.length !== 2) {
        throw new Error(`Expected 2 files from initial scan, got ${initialFiles.length}`);
    }

    const newFile = vscode.Uri.file(path.join(__dirname, 'test-files', 'extra.thrift'));
    provider.handleFileCreated(newFile);

    const updatedFiles = await provider.getThriftFiles();
    const hasNewFile = updatedFiles.some((file) => file.fsPath === newFile.fsPath);
    if (!hasNewFile) {
        throw new Error('Expected new file to be included after create event');
    }
    if (findFilesCalls !== 1) {
        throw new Error(`Expected no additional findFiles calls, got ${findFilesCalls}`);
    }

    const removedFile = initialFiles[0];
    provider.handleFileDeleted(removedFile);
    const afterDelete = await provider.getThriftFiles();
    const stillHasRemoved = afterDelete.some((file) => file.fsPath === removedFile.fsPath);
    if (stillHasRemoved) {
        throw new Error('Expected deleted file to be removed from file list');
    }

    console.log('✓ References file list incremental update test passed');
}

testIncrementalFileListUpdates().catch((error) => {
    console.error('❌ References file list incremental update test failed:', error.message);
    process.exit(1);
});
