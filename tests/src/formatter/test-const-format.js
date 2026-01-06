const assert = require('assert');

const { formatConstFields } = require('../../../out/formatter/const-format.js');

function run() {
    console.log('\nRunning thrift formatter const format tests...');

    const options = {
        insertSpaces: true,
        indentSize: 2,
        tabSize: 2,
        collectionStyle: 'preserve',
        maxLineLength: 100,
        alignComments: false
    };

    const deps = {
        getIndent: (level, opts) => ' '.repeat(level * (opts.indentSize || 2))
    };

    const constFields = [
        {
            type: 'i32',
            name: 'ID',
            value: '1',
            comment: ''
        }
    ];

    const constLines = formatConstFields(constFields, options, 0, deps);
    assert.deepStrictEqual(constLines, ['const i32 ID = 1'], 'Expected const field to format with base padding');

    console.log('✅ Thrift formatter const format tests passed!');
}

try {
    run();
} catch (err) {
    console.error('❌ Thrift formatter const format tests failed:', err);
    process.exit(1);
}
