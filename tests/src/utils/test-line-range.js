const assert = require('assert');

const {createVscodeMock, installVscodeMock} = require('../../mock_vscode.js');

const vscode = createVscodeMock();
installVscodeMock(vscode);

const {
    normalizeLineRange,
    mergeLineRanges,
    collapseLineRanges,
    lineRangeLineCount,
    rangeIntersectsLineRange,
    rangeContainsLineRange,
    lineRangeFromChange,
    lineRangeToVscodeRange
} = require('../../../out/utils/line-range.js');

function createDoc(text, name) {
    const uri = vscode.Uri.file(`/tmp/${name}`);
    const doc = vscode.createTextDocument(text, uri);
    doc.languageId = 'thrift';
    doc.uri = uri;
    doc.lineCount = text.split('\n').length;
    return doc;
}

function run() {
    console.log('\nRunning line range utils test...');

    assert.strictEqual(normalizeLineRange(null), null, 'Expected null to normalize to null');
    assert.strictEqual(normalizeLineRange({startLine: 2, endLine: 1}).startLine, 1, 'Expected normalization to reorder');
    assert.strictEqual(normalizeLineRange({startLine: 2, endLine: 1}).endLine, 2, 'Expected normalization to reorder');
    assert.strictEqual(normalizeLineRange({startLine: Number.NaN, endLine: 1}), null, 'Expected NaN to normalize to null');

    const merged = mergeLineRanges([
        {startLine: 5, endLine: 5},
        {startLine: 1, endLine: 2},
        {startLine: 2, endLine: 3},
        {startLine: 7, endLine: 8}
    ]);
    assert.deepStrictEqual(merged, [
        {startLine: 1, endLine: 3},
        {startLine: 5, endLine: 5},
        {startLine: 7, endLine: 8}
    ], 'Expected ranges to be merged and sorted');

    const collapsed = collapseLineRanges(merged);
    assert.deepStrictEqual(collapsed, {startLine: 1, endLine: 8}, 'Expected collapsed range to span all');

    assert.strictEqual(lineRangeLineCount({startLine: 3, endLine: 3}), 1, 'Expected line count to include both ends');

    const changeRange = lineRangeFromChange({
        range: new vscode.Range(1, 0, 2, 4),
        text: 'line a\nline b\n'
    });
    assert.deepStrictEqual(changeRange, {startLine: 1, endLine: 4}, 'Expected change range to expand with inserted lines');

    const range = new vscode.Range(1, 0, 3, 0);
    assert.ok(rangeIntersectsLineRange(range, {startLine: 2, endLine: 4}), 'Expected range to intersect');
    assert.ok(!rangeIntersectsLineRange(range, {startLine: 4, endLine: 5}), 'Expected range to not intersect');
    assert.ok(rangeContainsLineRange(range, {startLine: 1, endLine: 3}), 'Expected range to contain');
    assert.ok(!rangeContainsLineRange(range, {startLine: 0, endLine: 3}), 'Expected range to not contain');

    const doc = createDoc('a\nb\nc\nd', 'line-range.thrift');
    const vscodeRange = lineRangeToVscodeRange(doc, {startLine: 1, endLine: 2});
    assert.strictEqual(vscodeRange.start.line, 1, 'Expected start line to match');
    assert.strictEqual(vscodeRange.end.line, 2, 'Expected end line to match');

    console.log('✅ Line range utils test passed!');
}

run();
