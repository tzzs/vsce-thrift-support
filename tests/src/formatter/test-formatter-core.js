const assert = require('assert');

const { formatThriftContent } = require('../../../out/formatter/formatter-core.js');

function run() {
    console.log('\nRunning thrift formatter core tests...');

    const input = [
        'struct Foo { 1: i32 id }',
        'service Api { void ping() }'
    ].join('\n');

    const expected = [
        'struct Foo {',
        '    1: i32 id',
        '}',
        'service Api {',
        '    void ping()',
        '}'
    ].join('\n');

    const output = formatThriftContent(input);
    assert.strictEqual(output, expected, 'Expected inline definitions to expand with default formatting');

    console.log('✅ Thrift formatter core tests passed!');
}

try {
    run();
} catch (err) {
    console.error('❌ Thrift formatter core tests failed:', err);
    process.exit(1);
}
