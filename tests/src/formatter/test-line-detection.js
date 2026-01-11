const assert = require('assert');

const {
    isEnumStartLine,
    isServiceStartLine,
    isStructStartLine
} = require('../../../out/formatter/line-detection.js');

function run() {

    assert.strictEqual(isStructStartLine('struct User {'), true, 'Expected struct start detection');
    assert.strictEqual(isStructStartLine('struct User {}'), false, 'Expected non-block struct start detection');

    assert.strictEqual(isEnumStartLine('enum Status {'), true, 'Expected enum start detection');
    assert.strictEqual(isEnumStartLine('enum Status {}'), false, 'Expected non-block enum start detection');

    assert.strictEqual(isServiceStartLine('service Api {'), true, 'Expected service start detection');
    assert.strictEqual(isServiceStartLine('service Api {}'), false, 'Expected non-block service start detection');

}

describe('line-detection', () => {
    it('should pass all test assertions', () => {
        run();
    });
});
