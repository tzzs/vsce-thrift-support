const assert = require('assert');

const {formatServiceContentLine} = require('../../../out/formatter/service-content.js');
const {normalizeGenericsInSignature} = require('../../../out/formatter/text-utils.js');

function run() {

    const options = {insertSpaces: true, indentSize: 2, tabSize: 2};
    const deps = {
        getServiceIndent: (level) => ' '.repeat(level * 2),
        normalizeGenericsInSignature,
        isServiceMethod: (line) => /^\s*(oneway\s+)?[A-Za-z_][A-Za-z0-9_]*(?:\s*<[^>]*>)?\s+[A-Za-z_][A-Za-z0-9_]*\s*\([^)]*\)(\s*throws\s*\([^)]*\))?\s*[;,]?$/.test(line)
    };

    const closeResult = formatServiceContentLine('}', 0, options, deps);
    assert.deepStrictEqual(closeResult.formattedLines, ['}'], 'Expected closing brace formatting');
    assert.strictEqual(closeResult.closeService, true, 'Expected closeService for brace');

    const paramResult = formatServiceContentLine('1: i32 id', 0, options, deps);
    assert.deepStrictEqual(paramResult.formattedLines, ['    1: i32 id'], 'Expected params to indent two levels');

    const methodResult = formatServiceContentLine('map < string , i32 > ping(1: i32 id)', 0, options, deps);
    assert.deepStrictEqual(
        methodResult.formattedLines,
        ['  map<string,i32> ping(1: i32 id)'],
        'Expected service method normalization and indent'
    );

    const docResult = formatServiceContentLine('/** doc */', 0, options, deps);
    assert.deepStrictEqual(docResult.formattedLines, ['  /** doc */'], 'Expected doc comment indent');

    const otherResult = formatServiceContentLine('// note', 0, options, deps);
    assert.deepStrictEqual(otherResult.formattedLines, ['  // note'], 'Expected comment indent');

}

describe('service-content', () => {
    it('should pass all test assertions', () => {
        run();
    });
});
