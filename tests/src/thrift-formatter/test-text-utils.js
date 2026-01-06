const assert = require('assert');

const {
    normalizeGenericsInSignature,
    splitTopLevelParts
} = require('../../../out/thrift-formatter/text-utils.js');

function run() {
    console.log('\nRunning thrift formatter text utils tests...');

    const parts = splitTopLevelParts('A, B<map<string, i32>>, C = "x,y", D');
    assert.deepStrictEqual(
        parts,
        ['A', 'B<map<string, i32>>', 'C = "x,y"', 'D'],
        'Expected top-level parts split to ignore nested commas and strings'
    );

    const normalized = normalizeGenericsInSignature(
        'i32 foo(1: map < string , list < i32 > > arg) // comment'
    );
    assert.strictEqual(
        normalized,
        'i32 foo(1: map<string,list<i32>> arg) // comment',
        'Expected generic spacing to be normalized with comment preserved'
    );

    console.log('✅ Thrift formatter text utils tests passed!');
}

try {
    run();
} catch (err) {
    console.error('❌ Thrift formatter text utils tests failed:', err);
    process.exit(1);
}
