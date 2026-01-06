const assert = require('assert');

const { formatBlockComment } = require('../../../out/formatter/comment-format.js');

function run() {
    console.log('\nRunning thrift formatter comment format tests...');

    const options = { insertSpaces: true, indentSize: 2 };
    const deps = {
        getIndent: (level) => ' '.repeat(level * 2),
        getServiceIndent: (level) => ' '.repeat(level * 2)
    };

    const lines = [
        'struct User {',
        '  /* comment',
        '   * mid',
        '   */',
        '}'
    ];

    const result = formatBlockComment(lines, 1, 1, false, 0, options, deps);
    assert.ok(result, 'Expected block comment to be formatted');
    assert.deepStrictEqual(
        result.formattedLines,
        ['  /* comment', '   * mid', '   */'],
        'Expected block comment to align to indent'
    );
    assert.strictEqual(result.endIndex, 3, 'Expected end index to be last comment line');

    console.log('✅ Thrift formatter comment format tests passed!');
}

try {
    run();
} catch (err) {
    console.error('❌ Thrift formatter comment format tests failed:', err);
    process.exit(1);
}
