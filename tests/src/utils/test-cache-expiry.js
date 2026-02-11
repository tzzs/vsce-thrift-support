const assert = require('assert');
const {isExpired, isFresh} = require('../../../out/utils/cache-expiry.js');

describe('cache-expiry', () => {
    it('should treat ttlMs <= 0 as not expired', () => {
        assert.strictEqual(isExpired(0, 0, 1000), false);
        assert.strictEqual(isExpired(0, -1, 1000), false);
    });

    it('should detect expired values', () => {
        const now = 2000;
        assert.strictEqual(isExpired(0, 1000, now), true);
        assert.strictEqual(isFresh(0, 1000, now), false);
    });

    it('should detect fresh values', () => {
        const now = 1500;
        assert.strictEqual(isExpired(1000, 1000, now), false);
        assert.strictEqual(isFresh(1000, 1000, now), true);
    });
});
