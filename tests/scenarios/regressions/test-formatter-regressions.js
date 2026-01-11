const assert = require('assert');
const {ThriftFormatter} = require('../../../out/formatter/index.js');

function testSingleLineSplits() {
    const formatter = new ThriftFormatter();
    const input = 'struct User{1:i32 id,2:string name,3:list<i32> nums}';
    const output = formatter.format(input, {
        alignTypes: true,
        alignFieldNames: true,
        indentSize: 4,
        insertSpaces: true,
        tabSize: 4,
        trailingComma: 'preserve'
    });

    assert.ok(output.includes('1:'), 'Field 1 should remain');
    assert.ok(output.includes('2:'), 'Field 2 should remain');
    assert.ok(output.includes('3:'), 'Field 3 should remain');
    const lines = output.split('\n').filter(l => l.trim().startsWith('1:') || l.trim().startsWith('2:') || l.trim().startsWith('3:'));
    assert.strictEqual(lines.length, 3, 'All three fields should be preserved when splitting by comma');
}

function testConstTrailingComment() {
    const formatter = new ThriftFormatter();
    const input = `const map<string, i32> mapping = {\n  "a": 1,\n  "b": 2\n} // keep me\nstruct Foo { 1: i32 id }`;
    const output = formatter.format(input, {
        alignTypes: true,
        alignFieldNames: true,
        indentSize: 4,
        insertSpaces: true,
        tabSize: 4,
        trailingComma: 'preserve'
    });

    assert.ok(/const\s+map<string,i32>/.test(output), 'Const definition should remain present');
    assert.ok(output.includes('struct Foo'), 'Following struct should not be swallowed by const parsing');
}

function run() {
    console.log('Running formatter regression tests...');
    testSingleLineSplits();
    testConstTrailingComment();
    console.log('Formatter regression tests passed.');
}

run();
