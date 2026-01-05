const assert = require('assert');

const {createVscodeMock, installVscodeMock} = require('../../mock_vscode.js');

const vscode = createVscodeMock({
    window: {
        showErrorMessage: () => Promise.resolve(undefined)
    }
});
installVscodeMock(vscode);

const {ThriftFormattingProvider} = require('../../../out/formatting-provider.js');
const {IncrementalTracker} = require('../../../out/utils/incremental-tracker.js');
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
    console.log('\nRunning incremental formatting test...');

    const originalFormattingEnabled = config.incremental.formattingEnabled;
    const originalMaxDirty = config.incremental.maxDirtyLines;
    config.incremental.formattingEnabled = true;
    config.incremental.maxDirtyLines = 2;

    try {
        const tracker = new IncrementalTracker();
        const provider = new ThriftFormattingProvider({incrementalTracker: tracker});

        const text = [
            'struct A {',
            '1:i32 id',
            '}',
            '',
            'struct B {',
            '1:i32 name',
            '}'
        ].join('\n');
        const doc = createDoc(text, 'incremental-format.thrift');

        tracker.markChanges({
            document: doc,
            contentChanges: [
                {
                    range: new vscode.Range(1, 0, 1, 0),
                    text: '1: i32 id'
                }
            ]
        });

        const edits = provider.provideDocumentFormattingEdits(doc, {insertSpaces: true, tabSize: 4});
        assert.ok(Array.isArray(edits), 'Expected edits array');
        assert.strictEqual(edits.length, 1, 'Expected a single edit');

        const range = edits[0].range;
        assert.strictEqual(range.start.line, 1, 'Expected incremental edit to start at dirty line');
        assert.strictEqual(range.start.character, 0, 'Expected incremental edit to start at column 0');
        assert.strictEqual(range.end.line, 1, 'Expected incremental edit to end on dirty line');
        assert.ok(range.end.character > 0, 'Expected incremental edit to cover changed content');

        config.incremental.maxDirtyLines = 1;
        const doc2 = createDoc(text, 'incremental-format-full.thrift');
        tracker.markChanges({
            document: doc2,
            contentChanges: [
                {
                    range: new vscode.Range(0, 0, 2, 0),
                    text: 'struct A {\n1: i32 id\n}\n'
                }
            ]
        });
        const editsFull = provider.provideDocumentFormattingEdits(doc2, {insertSpaces: true, tabSize: 4});
        assert.strictEqual(editsFull.length, 1, 'Expected a single edit for full format');
        const fullRange = editsFull[0].range;
        assert.strictEqual(fullRange.start.line, 0, 'Expected full formatting to start at line 0');
        assert.strictEqual(fullRange.end.line, doc2.lineCount - 1, 'Expected full formatting to end at last line');

        console.log('✅ Incremental formatting test passed!');
    } finally {
        config.incremental.formattingEnabled = originalFormattingEnabled;
        config.incremental.maxDirtyLines = originalMaxDirty;
    }
}

run();
