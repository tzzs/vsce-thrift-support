const assert = require('assert');

const {tokenizeLine} = require('../../../../out/ast/tokenizer.js');

function tokenSummary(tokens) {
    return tokens.map(token => `${token.type}:${token.value}`);
}

async function run() {

    const line = 'namespace java com.example // comment';
    const tokens = tokenizeLine(line);
    const summary = tokenSummary(tokens);

    assert.deepStrictEqual(summary, [
        'identifier:namespace',
        'whitespace: ',
        'identifier:java',
        'whitespace: ',
        'identifier:com',
        'symbol:.',
        'identifier:example',
        'whitespace: ',
        'comment:// comment'
    ]);

    const includeLine = 'include "shared.thrift"';
    const includeTokens = tokenizeLine(includeLine);
    const includeString = includeTokens.find(token => token.type === 'string');
    assert.strictEqual(includeString?.value, 'shared.thrift');
    assert.strictEqual(includeString?.start, includeLine.indexOf('"'));
    assert.strictEqual(includeString?.end, includeLine.length);

}

describe('tokenizer', () => {
    it('should pass all test assertions', async () => {
        await run();
    });
});