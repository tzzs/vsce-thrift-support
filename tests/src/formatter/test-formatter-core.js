const assert = require('assert');

const {formatThriftContent} = require('../../../out/formatter/formatter-core.js');

function run() {

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

}

describe('formatter-core', () => {
    it('should pass all test assertions', () => {
        run();
    });
});
