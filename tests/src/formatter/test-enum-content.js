const assert = require('assert');

const { formatEnumContentLine } = require('../../../out/formatter/enum-content.js');
const { parseEnumFieldText } = require('../../../out/formatter/field-parser.js');

function run() {
    console.log('\nRunning thrift formatter enum content tests...');

    const options = { insertSpaces: true, indentSize: 2, tabSize: 2 };
    const deps = {
        getIndent: (level) => ' '.repeat(level * 2),
        formatEnumFields: (fields, _opts, indentLevel) =>
            fields.map(f => ' '.repeat(indentLevel * 2) + f.line),
        buildEnumFieldFromAst: () => null,
        parseEnumFieldText,
        isEnumFieldText: (line) => /^[A-Z_]+\s*=/.test(line)
    };

    const enumFields = [];
    const enumIndex = new Map();

    const fieldResult = formatEnumContentLine('ACTIVE = 1', 0, 1, enumFields, enumIndex, options, deps);
    assert.strictEqual(fieldResult.handled, true, 'Expected enum field to be handled');
    assert.strictEqual(fieldResult.enumFields.length, 1, 'Expected enum field to be collected');

    const flushResult = formatEnumContentLine('// comment', 1, 1, fieldResult.enumFields, enumIndex, options, deps);
    assert.deepStrictEqual(flushResult.formattedLines, ['  ACTIVE = 1'], 'Expected enum fields flush before comment');

    const closeResult = formatEnumContentLine('}', 2, 1, [], enumIndex, options, deps);
    assert.deepStrictEqual(closeResult.formattedLines, ['}'], 'Expected close brace formatting');
    assert.strictEqual(closeResult.inEnum, false, 'Expected enum to close');

    console.log('✅ Thrift formatter enum content tests passed!');
}

try {
    run();
} catch (err) {
    console.error('❌ Thrift formatter enum content tests failed:', err);
    process.exit(1);
}
