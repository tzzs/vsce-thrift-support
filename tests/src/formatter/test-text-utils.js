const assert = require('assert');

const {
    normalizeGenericsInSignature,
    splitTopLevelParts
} = require('../../../out/formatter/text-utils.js');

function run() {

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

}

describe('text-utils', () => {
    it('should pass all test assertions', () => {
        run();
    });
});
