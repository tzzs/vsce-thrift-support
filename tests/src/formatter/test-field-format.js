const assert = require('assert');

const { formatEnumFields } = require('../../../out/formatter/field-format.js');
const { formatStructFields } = require('../../../out/formatter/struct-format.js');

function run() {
    console.log('\nRunning thrift formatter field format tests...');

    const options = {
        insertSpaces: true,
        indentSize: 2,
        tabSize: 2,
        alignTypes: false,
        alignFieldNames: false,
        alignComments: false,
        alignAnnotations: false,
        alignEnumNames: false,
        alignEnumEquals: false,
        alignEnumValues: false,
        trailingComma: 'preserve'
    };

    const deps = {
        getIndent: (level, opts) => ' '.repeat(level * (opts.indentSize || 2))
    };

    const structFields = [
        {
            id: '1',
            qualifier: 'required',
            type: 'i32',
            name: 'id',
            suffix: '',
            annotation: '',
            comment: '',
            line: '1: required i32 id'
        }
    ];

    const structLines = formatStructFields(structFields, options, 1, deps);
    assert.deepStrictEqual(structLines, ['  1: required i32 id'], 'Expected struct field to preserve line');

    const enumFields = [
        {
            name: 'ACTIVE',
            value: '1',
            suffix: '',
            annotation: '',
            comment: '',
            line: 'ACTIVE = 1'
        }
    ];

    const enumLines = formatEnumFields(enumFields, options, 0, deps);
    assert.deepStrictEqual(enumLines, ['ACTIVE = 1'], 'Expected enum field to preserve line');

    console.log('✅ Thrift formatter field format tests passed!');
}

try {
    run();
} catch (err) {
    console.error('❌ Thrift formatter field format tests failed:', err);
    process.exit(1);
}
