const assert = require('assert');

const {createVscodeMock, installVscodeMock} = require('../../mock_vscode.js');

const vscode = createVscodeMock({
    window: {
        showErrorMessage: () => Promise.resolve(undefined)
    }
});
installVscodeMock(vscode);

const {ThriftFormattingProvider} = require('../../../out/formatting-bridge/index.js');
const {config} = require('../../../out/config/index.js');

function createDoc(text, name) {
    const uri = vscode.Uri.file(`/tmp/${name}`);
    const doc = vscode.createTextDocument(text, uri);
    doc.languageId = 'thrift';
    doc.uri = uri;
    doc.lineCount = text.split('\n').length;
    return doc;
}

function run() {
    console.log('\nRunning incremental formatting DI test...');

    const originalFormattingEnabled = config.incremental.formattingEnabled;
    const originalMaxDirty = config.incremental.maxDirtyLines;
    config.incremental.formattingEnabled = true;
    config.incremental.maxDirtyLines = 2;

    try {
        const fakeTracker = {
            consumeDirtyRange: () => ({startLine: 1, endLine: 1})
        };
        const provider = new ThriftFormattingProvider({
            incrementalTracker: fakeTracker,
            errorHandler: {handleError: () => {}}
        });

        const text = [
            'struct A {',
            '1:i32 id',
            '}'
        ].join('\n');
        const doc = createDoc(text, 'incremental-format-di.thrift');

        const edits = provider.provideDocumentFormattingEdits(doc, {insertSpaces: true, tabSize: 4});
        assert.ok(Array.isArray(edits), 'Expected edits array');
        assert.strictEqual(edits.length, 1, 'Expected a single edit');

        const range = edits[0].range;
        assert.strictEqual(range.start.line, 1, 'Expected incremental edit to start at dirty line');
        assert.strictEqual(range.end.line, 1, 'Expected incremental edit to end at dirty line');

        console.log('✅ Incremental formatting DI test passed!');
    } finally {
        config.incremental.formattingEnabled = originalFormattingEnabled;
        config.incremental.maxDirtyLines = originalMaxDirty;
    }
}

run();
