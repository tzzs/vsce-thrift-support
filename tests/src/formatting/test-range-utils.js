const vscode = require('../../mock_vscode');
const { createTextDocument, createVscodeMock, installVscodeMock, Position, Range } = vscode;

const mock = createVscodeMock();
installVscodeMock(mock);

const { normalizeFormattingRange, buildMinimalEdits } = require('../../../out/formatting/range-utils.js');

function run() {
    console.log('\nRunning formatting range utils tests...');

    const text = ['struct User {', '  1: i32 id', '}'].join('\n');
    const doc = createTextDocument(text, mock.Uri.file('file:///test.thrift'));
    const range = new Range(new Position(0, 3), new Position(1, 5));
    const normalized = normalizeFormattingRange(doc, range);
    if (normalized.start.character !== 0 || normalized.end.character !== doc.lineAt(1).text.length) {
        throw new Error('Expected normalized range to align to full lines');
    }

    const original = 'struct User {\n  1: i32 id\n}';
    const formatted = 'struct User {\n  1: i32 id\n}\n';
    const edits = buildMinimalEdits(doc, new Range(new Position(0, 0), new Position(2, 1)), original, formatted);
    if (edits.length !== 1) {
        throw new Error(`Expected one minimal edit, got ${edits.length}`);
    }

    console.log('✅ Formatting range utils tests passed!');
}

try {
    run();
} catch (error) {
    console.error('❌ Formatting range utils tests failed:', error.message);
    process.exit(1);
}
