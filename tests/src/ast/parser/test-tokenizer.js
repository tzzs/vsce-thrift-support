const assert = require('assert');

const {ThriftTokenizer, tokenizeLine} = require('../../../../out/ast/tokenizer.js');

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

    const inlineBlock = 'struct /* ignore */ User {}';
    const inlineTokens = tokenizeLine(inlineBlock);
    const inlineSummary = tokenSummary(inlineTokens);
    assert.ok(inlineSummary.includes('identifier:struct'));
    assert.ok(inlineSummary.includes('identifier:User'));
    assert.ok(inlineSummary.some(item => item.startsWith('comment:')));

    const tokenizer = new ThriftTokenizer();
    const blockStart = tokenizer.tokenizeLine('/* block comment starts');
    assert.ok(blockStart.some(token => token.type === 'comment'));
    const blockMiddle = tokenizer.tokenizeLine('struct Ghost {');
    const blockMeaningful = blockMiddle.filter(token => token.type !== 'whitespace' && token.type !== 'comment');
    assert.strictEqual(blockMeaningful.length, 0);
    const blockEnd = tokenizer.tokenizeLine('*/ struct Real {');
    const endMeaningful = blockEnd.filter(token => token.type !== 'whitespace' && token.type !== 'comment');
    assert.ok(endMeaningful.some(token => token.type === 'identifier' && token.value === 'struct'));
    assert.ok(endMeaningful.some(token => token.type === 'identifier' && token.value === 'Real'));

    const hashInString = 'const string s = "#notcomment"';
    const hashTokens = tokenizeLine(hashInString);
    assert.ok(hashTokens.every(token => token.type !== 'comment'));

}

describe('tokenizer', () => {
    it('should pass all test assertions', async () => {
        await run();
    });
});
