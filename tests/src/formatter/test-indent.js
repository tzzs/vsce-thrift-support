const assert = require('assert');

const {getIndent, getServiceIndent} = require('../../../out/formatter/indent.js');

function run() {

    const options = {insertSpaces: true, indentSize: 2};
    assert.strictEqual(getIndent(2, options), '    ', 'Expected space indent to match size');
    assert.strictEqual(getServiceIndent(1, options), '  ', 'Expected service indent to match base indent');

    const tabOptions = {insertSpaces: false, indentSize: 4};
    assert.strictEqual(getIndent(3, tabOptions), '\t\t\t', 'Expected tab indent to repeat per level');

}

describe('indent', () => {
    it('should pass all test assertions', () => {
        run();
    });
});
