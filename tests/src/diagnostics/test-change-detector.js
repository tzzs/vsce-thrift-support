const assert = require('assert');

const {createVscodeMock, installVscodeMock} = require('../../mock_vscode.js');

const vscode = createVscodeMock();
installVscodeMock(vscode);

const {getDirtyChangeSummary} = require('../../../out/diagnostics/change-detector.js');

function createDoc(text, name) {
    const uri = vscode.Uri.file(`/tmp/${name}`);
    const doc = vscode.createTextDocument(text, uri);
    doc.languageId = 'thrift';
    doc.uri = uri;
    doc.version = 1;
    doc.lineCount = text.split('\n').length;
    return doc;
}

function createChange(startLine, startChar, endLine, endChar, text) {
    return {
        range: new vscode.Range(new vscode.Position(startLine, startChar), new vscode.Position(endLine, endChar)),
        text
    };
}

function run() {
    console.log('\nRunning diagnostics change detector test...');

    const doc = createDoc(
        [
            'struct A {',
            '  1: i32 id,',
            '}',
            ''
        ].join('\n'),
        'change-detector.thrift'
    );

    const simpleChange = createChange(1, 5, 1, 8, 'i64');
    const simpleSummary = getDirtyChangeSummary(doc, [simpleChange]);

    assert.strictEqual(simpleSummary.includesMayChange, false, 'Expected no include change');
    assert.strictEqual(simpleSummary.structuralChange, false, 'Expected no structural change');
    assert.strictEqual(simpleSummary.dirtyLineCount, 0, 'Expected no dirty line delta');
    assert.deepStrictEqual(simpleSummary.mergedDirtyRanges, [{ startLine: 1, endLine: 1 }], 'Expected merged range for single change');
    assert.deepStrictEqual(simpleSummary.dirtyRange, { startLine: 1, endLine: 1 }, 'Expected collapsed range for single change');

    const includeChange = createChange(3, 0, 3, 0, 'include "a.thrift"\n');
    const multiSummary = getDirtyChangeSummary(doc, [simpleChange, includeChange]);

    assert.strictEqual(multiSummary.includesMayChange, true, 'Expected include change detection');
    assert.strictEqual(multiSummary.structuralChange, true, 'Expected structural change detection');
    assert.strictEqual(multiSummary.dirtyLineCount, 1, 'Expected dirty line delta to count added line');
    assert.deepStrictEqual(
        multiSummary.mergedDirtyRanges,
        [
            { startLine: 1, endLine: 1 },
            { startLine: 3, endLine: 4 }
        ],
        'Expected merged ranges for multiple changes'
    );
    assert.deepStrictEqual(multiSummary.dirtyRange, { startLine: 1, endLine: 4 }, 'Expected collapsed range across changes');

    console.log('✅ Diagnostics change detector test passed!');
}

try {
    run();
} catch (err) {
    console.error('❌ Diagnostics change detector test failed:', err);
    process.exit(1);
}
