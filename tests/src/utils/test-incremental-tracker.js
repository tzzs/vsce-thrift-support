const assert = require('assert');
const vscode = require('vscode');

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

    const originalFormattingEnabled = config.incremental.formattingEnabled;
    const originalAnalysisEnabled = config.incremental.analysisEnabled;
    const originalMaxDirty = config.incremental.maxDirtyLines;
    config.incremental.formattingEnabled = true;
    config.incremental.analysisEnabled = false;
    config.incremental.maxDirtyLines = 10;

    try {
        const tracker = new IncrementalTracker();
        const text = [
            'struct A {',
            '1:i32 id',
            '2:i32 name',
            '}',
            '',
            'struct B {',
            '1:i32 age',
            '}'
        ].join('\n');
        const doc = createDoc(text, 'incremental-tracker.thrift');

        tracker.markChanges({
            document: doc,
            contentChanges: [
                {range: new vscode.Range(1, 0, 1, 0), text: '1: i32 id'},
                {range: new vscode.Range(6, 0, 6, 0), text: '1: i32 age'}
            ]
        });

        const dirtyRange = tracker.consumeDirtyRange(doc);
        assert.ok(dirtyRange, 'Expected merged dirty range');
        assert.strictEqual(dirtyRange.startLine, 1, 'Expected merged range to start at first dirty line');
        assert.strictEqual(dirtyRange.endLine, 6, 'Expected merged range to end at last dirty line');
        assert.strictEqual(tracker.consumeDirtyRange(doc), undefined, 'Expected dirty ranges to be cleared after consume');

        config.incremental.maxDirtyLines = 1;
        const doc2 = createDoc(text, 'incremental-tracker-max.thrift');
        tracker.markChanges({
            document: doc2,
            contentChanges: [
                {range: new vscode.Range(0, 0, 2, 0), text: 'struct A {\\n1: i32 id\\n2: i32 name\\n'}
            ]
        });
        const overflowRange = tracker.consumeDirtyRange(doc2);
        assert.strictEqual(overflowRange, undefined, 'Expected dirty range to be dropped when exceeding maxDirtyLines');

    } finally {
        config.incremental.formattingEnabled = originalFormattingEnabled;
        config.incremental.analysisEnabled = originalAnalysisEnabled;
        config.incremental.maxDirtyLines = originalMaxDirty;
    }
}

describe('incremental-tracker', () => {
    it('should pass all test assertions', () => {
        run();
    });
});
