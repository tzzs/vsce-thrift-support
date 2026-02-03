const assert = require('assert');
const {makeLineRangeKey, makeUriRangeKey} = require('../../../out/utils/cache-keys.js');

describe('cache-keys', () => {
    it('should build line range keys', () => {
        const key = makeLineRangeKey({startLine: 1, endLine: 10});
        assert.strictEqual(key, '1-10');
    });

    it('should build uri range keys', () => {
        const key = makeUriRangeKey('file:///test.thrift', {startLine: 2, endLine: 3});
        assert.strictEqual(key, 'file:///test.thrift:2-3');
    });
});
