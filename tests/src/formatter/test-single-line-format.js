const assert = require('assert');

const {
    formatSingleLineEnum,
    formatSingleLineService,
    formatSingleLineStruct
} = require('../../../out/formatter/single-line-format.js');
const {
    normalizeGenericsInSignature,
    splitTopLevelParts
} = require('../../../out/formatter/text-utils.js');
const {
    parseEnumFieldText,
    parseStructFieldText
} = require('../../../out/formatter/field-parser.js');

function run() {

    const options = {insertSpaces: true, indentSize: 2, tabSize: 2};
    const deps = {
        getIndent: (level) => ' '.repeat(level * 2),
        getServiceIndent: (level) => ' '.repeat(level * 2),
        formatStructFields: (fields, _opts, indentLevel) =>
            fields.map(f => ' '.repeat(indentLevel * 2) + `${f.id}: ${f.type} ${f.name}`),
        formatEnumFields: (fields, _opts, indentLevel) =>
            fields.map(f => ' '.repeat(indentLevel * 2) + `${f.name} = ${f.value}`),
        parseStructFieldText,
        parseEnumFieldText,
        normalizeGenericsInSignature,
        splitTopLevelParts
    };

    const structLines = formatSingleLineStruct(
        'struct User {1: i32 id, 2: string name}',
        0,
        options,
        deps
    );
    assert.deepStrictEqual(
        structLines,
        ['struct User {', '  1: i32 id', '  2: string name', '}'],
        'Expected single-line struct to expand into multi-line output'
    );

    const enumLines = formatSingleLineEnum(
        'enum Status { ACTIVE = 1, INACTIVE = 2 }',
        0,
        options,
        deps
    );
    assert.deepStrictEqual(
        enumLines,
        ['enum Status {', '  ACTIVE = 1', '  INACTIVE = 2', '}'],
        'Expected single-line enum to expand into multi-line output'
    );

    const serviceLines = formatSingleLineService(
        'service Api { map < string , i32 > ping(1: i32 id) }',
        0,
        options,
        deps
    );
    assert.deepStrictEqual(
        serviceLines,
        ['service Api {', '  map<string,i32> ping(1: i32 id)', '}'],
        'Expected single-line service to normalize generics and expand'
    );

    const nullStruct = formatSingleLineStruct('struct User {', 0, options, deps);
    assert.strictEqual(nullStruct, null, 'Expected non-inline struct to return null');

}

describe('single-line-format', () => {
    it('should pass all test assertions', () => {
        run();
    });
});
