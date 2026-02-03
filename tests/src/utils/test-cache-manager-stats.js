const assert = require('assert');
const {CacheManager} = require('../../../out/utils/cache-manager.js');

describe('cache-manager-stats', () => {
    it('should only increment cleanup count when entries are removed', () => {
        const cacheManager = CacheManager.getInstance();
        cacheManager.clearAll();

        cacheManager.registerCache('test-cache-cleanup-count', {maxSize: 1, ttl: 100000});
        cacheManager.set('test-cache-cleanup-count', 'a', 1);

        let stats = cacheManager.getCacheStats('test-cache-cleanup-count');
        assert.strictEqual(stats.cleanupCount, 0, 'Cleanup count should remain 0 without eviction');

        cacheManager.set('test-cache-cleanup-count', 'b', 2);
        stats = cacheManager.getCacheStats('test-cache-cleanup-count');
        assert.strictEqual(stats.cleanupCount, 1, 'Cleanup count should increment after eviction');
    });
});
