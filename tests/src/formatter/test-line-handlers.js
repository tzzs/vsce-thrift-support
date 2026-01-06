const assert = require('assert');

const {
    flushConstBlockIfNeeded,
    flushStructFieldsIfNeeded,
    formatOpenBraceLine,
    formatSkippedLine,
    formatTypedefLine,
    handleConstStartLine
} = require('../../../out/formatter/line-handlers.js');
const { parseConstFieldText } = require('../../../out/formatter/field-parser.js');
const { normalizeGenericsInSignature } = require('../../../out/formatter/text-utils.js');

function run() {
    console.log('\nRunning thrift formatter line handlers tests...');

    const options = { insertSpaces: true, indentSize: 2, tabSize: 2 };
    const indent = (level) => ' '.repeat(level * 2);

    const structFlush = flushStructFieldsIfNeeded(
        true,
        [{ line: '1: i32 id' }],
        '// comment',
        2,
        new Map(),
        1,
        options,
        {
            formatStructFields: (fields, _opts, indentLevel) =>
                fields.map(f => indent(indentLevel) + f.line),
            isStructFieldText: () => false
        }
    );
    assert.deepStrictEqual(structFlush.formattedLines, ['  1: i32 id'], 'Expected struct fields flush');

    const constFlush = flushConstBlockIfNeeded(
        true,
        [{ type: 'i32', name: 'ID', value: '1', comment: '' }],
        false,
        null,
        0,
        options,
        {
            formatConstFields: (fields) => fields.map(f => `const ${f.type} ${f.name} = ${f.value}`)
        }
    );
    assert.deepStrictEqual(constFlush.formattedLines, ['const i32 ID = 1'], 'Expected const fields flush');

    const skipped = formatSkippedLine('// note', false, 0, 1, options, {
        getIndent: (level) => indent(level),
        getServiceIndent: (level) => indent(level)
    });
    assert.deepStrictEqual(skipped, ['  // note'], 'Expected line comment format');

    const constStart = handleConstStartLine(
        ['const i32 ID = 1'],
        0,
        true,
        new Map([[0, 0]]),
        false,
        false,
        false,
        0,
        [],
        null,
        { parseConstFieldText }
    );
    assert.strictEqual(constStart.constFields.length, 1, 'Expected const field parsed');

    const typedefLine = formatTypedefLine('typedef map < string , i32 > Foo', 0, options, {
        getIndent: (level) => indent(level),
        normalizeGenericsInSignature
    });
    assert.deepStrictEqual(
        typedefLine,
        ['typedef map<string,i32> Foo'],
        'Expected typedef normalization'
    );

    const braceLine = formatOpenBraceLine('{', 2, options, { getIndent: (level) => indent(level) });
    assert.deepStrictEqual(braceLine, ['  {'], 'Expected open brace indentation');

    console.log('✅ Thrift formatter line handlers tests passed!');
}

try {
    run();
} catch (err) {
    console.error('❌ Thrift formatter line handlers tests failed:', err);
    process.exit(1);
}
