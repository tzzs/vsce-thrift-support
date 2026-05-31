const assert = require('assert');
const vscode = require('vscode');

const {readThriftFile} = require('../../../out/utils/file-reader.js');

describe('file-reader', () => {
    let originalTextDocuments;
    let originalReadFile;

    beforeEach(() => {
        originalTextDocuments = vscode.workspace.textDocuments;
        originalReadFile = vscode.workspace.fs.readFile;
        vscode.workspace.textDocuments = [];
    });

    afterEach(() => {
        vscode.workspace.textDocuments = originalTextDocuments;
        vscode.workspace.fs.readFile = originalReadFile;
    });

    it('returns undefined when the file cannot be read', async () => {
        vscode.workspace.fs.readFile = async () => {
            throw new Error('missing file');
        };

        const content = await readThriftFile(vscode.Uri.file('/tmp/missing.thrift'));

        assert.strictEqual(content, undefined);
    });
});
