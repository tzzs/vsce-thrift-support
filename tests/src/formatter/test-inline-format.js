const assert = require('assert');

const {
    formatInlineEnum,
    formatInlineService,
    formatInlineStructLike,
    isInlineEnum,
    isInlineService,
    isInlineStructLike
} = require('../../../out/formatter/inline-format.js');
const {
    normalizeGenericsInSignature,
    splitTopLevelParts
} = require('../../../out/formatter/text-utils.js');
const {
    parseEnumFieldText,
    parseStructFieldText
} = require('../../../out/formatter/field-parser.js');

function run() {
    console.log('\nRunning thrift formatter inline format tests...');

    assert.strictEqual(isInlineStructLike('struct User {1: i32 id}'), true, 'Expected inline struct detection');
    assert.strictEqual(isInlineEnum('enum Status {ACTIVE = 1}'), true, 'Expected inline enum detection');
    assert.strictEqual(isInlineService('service S { i32 ping(1:i32 id) }'), true, 'Expected inline service detection');

    const options = { insertSpaces: true, indentSize: 2, tabSize: 2 };
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

    const structLines = formatInlineStructLike(
        'struct User {1: i32 id, 2: string name}',
        0,
        options,
        deps
    );
    assert.deepStrictEqual(
        structLines,
        ['struct User {', '  1: i32 id', '  2: string name', '}'],
        'Expected inline struct to split into multiline output'
    );

    const enumLines = formatInlineEnum(
        'enum Status { ACTIVE = 1, INACTIVE = 2 }',
        0,
        options,
        deps
    );
    assert.deepStrictEqual(
        enumLines,
        ['enum Status {', '  ACTIVE = 1', '  INACTIVE = 2', '}'],
        'Expected inline enum to split into multiline output'
    );

    const serviceLines = formatInlineService(
        'service S { map < string , i32 > ping(1: i32 id) }',
        0,
        options,
        deps
    );
    assert.deepStrictEqual(
        serviceLines,
        ['service S {', '  map<string,i32> ping(1: i32 id)', '}'],
        'Expected inline service to normalize generics and split into multiline output'
    );

    console.log('✅ Thrift formatter inline format tests passed!');
}

try {
    run();
} catch (err) {
    console.error('❌ Thrift formatter inline format tests failed:', err);
    process.exit(1);
}
