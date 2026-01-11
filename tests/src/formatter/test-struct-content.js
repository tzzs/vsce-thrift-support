const assert = require('assert');

const {formatStructContentLine} = require('../../../out/formatter/struct-content.js');
const {normalizeGenericsInSignature} = require('../../../out/formatter/text-utils.js');
const {parseStructFieldText} = require('../../../out/formatter/field-parser.js');

function run() {

    const options = {insertSpaces: true, indentSize: 2, tabSize: 2};
    const deps = {
        getIndent: (level) => ' '.repeat(level * 2),
        formatStructFields: (fields, _opts, indentLevel) =>
            fields.map(f => ' '.repeat(indentLevel * 2) + f.line),
        buildStructFieldFromAst: () => null,
        parseStructFieldText,
        normalizeGenericsInSignature,
        isServiceMethod: (line) => /^i32\s+ping\(/.test(line)
    };

    const structFields = [];
    const structIndex = new Map();

    const fieldResult = formatStructContentLine('1: i32 id', 0, 1, structFields, structIndex, options, deps);
    assert.strictEqual(fieldResult.handled, true, 'Expected struct field to be handled');
    assert.strictEqual(fieldResult.structFields.length, 1, 'Expected struct field to be collected');

    const methodResult = formatStructContentLine('i32 ping(1: i32 id)', 0, 1, [], structIndex, options, deps);
    assert.deepStrictEqual(
        methodResult.formattedLines,
        ['  i32 ping(1: i32 id)'],
        'Expected service-like method to be normalized in struct'
    );

    const closeResult = formatStructContentLine('}', 0, 1, fieldResult.structFields, structIndex, options, deps);
    assert.deepStrictEqual(closeResult.formattedLines, ['  1: i32 id', '}'], 'Expected close brace flush');
    assert.strictEqual(closeResult.inStruct, false, 'Expected struct to close');

}

describe('struct-content', () => {
    it('should pass all test assertions', () => {
        run();
    });
});
