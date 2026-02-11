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

function createOptions(incrementalFormattingEnabled) {
    return {
        trailingComma: 'preserve',
        alignTypes: true,
        alignFieldNames: true,
        alignStructDefaults: false,
        alignAnnotations: true,
        alignComments: true,
        alignEnumNames: true,
        alignEnumEquals: true,
        alignEnumValues: true,
        indentSize: 4,
        maxLineLength: 100,
        collectionStyle: 'preserve',
        insertSpaces: true,
        tabSize: 4,
        incrementalFormattingEnabled
    };
}

function runIncremental() {
    const input = [
        'struct User { 1: i32 id }',
        'enum Status { ACTIVE = 1, INACTIVE = 2 }'
    ].join('\n');

    const full = formatThriftContent(input, createOptions(false));
    const incremental = formatThriftContent(input, createOptions(true), {startLine: 0, endLine: 1});

    assert.strictEqual(incremental, full, 'Expected incremental formatting to match full formatting');
}

function runIncrementalWithOutOfRangeDirty() {
    const input = [
        'struct User { 1: i32 id }',
        'service Api { void ping() }'
    ].join('\n');

    const full = formatThriftContent(input, createOptions(false));
    const incremental = formatThriftContent(input, createOptions(true), {startLine: 10, endLine: 20});

    assert.strictEqual(incremental, full, 'Expected out-of-range dirty range to be clamped');
}

describe('formatter-core', () => {
    it('should pass all test assertions', () => {
        run();
    });

    it('should match full formatting with incremental parsing', () => {
        runIncremental();
    });

    it('should clamp dirty range for incremental parsing', () => {
        runIncrementalWithOutOfRangeDirty();
    });
});
