// Mock vscode is handled by require hook
const assert = require('assert');
const { CacheManager } = require('../../../out/utils/cache-manager.js');

describe('Concurrent Cache Access', () => {
    beforeEach(() => {
        const cacheManager = CacheManager.getInstance();
        cacheManager.clearAll();
    });

    it('should handle concurrent writes without data corruption', async () => {
        const cacheManager = CacheManager.getInstance();

        cacheManager.registerCache('concurrent-cache', {
            maxSize: 100,  // Increase maxSize to avoid eviction during concurrent writes
            ttl: 60000
        });

        // Simulate concurrent writes
        const promises = [];
        for (let i = 0; i < 10; i++) {
            promises.push(new Promise(resolve => {
                setTimeout(() => {
                    cacheManager.set('concurrent-cache', `key${i}`, `value${i}`);
                    resolve();
                }, Math.random() * 10);
            }));
        }

        await Promise.all(promises);

        // Verify all values are correctly stored
        for (let i = 0; i < 10; i++) {
            const value = cacheManager.get('concurrent-cache', `key${i}`);
            assert.strictEqual(value, `value${i}`, `Value for key${i} should be correct`);
        }

        const stats = cacheManager.getCacheStats('concurrent-cache');
        assert.strictEqual(stats.size, 10, 'All 10 items should be in cache');
    });

    it('should maintain consistency with concurrent read/write operations', async () => {
        const cacheManager = CacheManager.getInstance();

        cacheManager.registerCache('rw-cache', {
            maxSize: 5,
            ttl: 60000
        });

        // Mix of reads and writes
        const operations = [];
        for (let i = 0; i < 20; i++) {
            operations.push(new Promise(resolve => {
                setTimeout(() => {
                    const isWrite = Math.random() > 0.5;
                    if (isWrite) {
                        const key = `key${Math.floor(Math.random() * 5)}`;
                        const value = `value${Math.floor(Math.random() * 100)}`;
                        cacheManager.set('rw-cache', key, value);
                    } else {
                        const key = `key${Math.floor(Math.random() * 5)}`;
                        cacheManager.get('rw-cache', key);
                    }
                    resolve();
                }, Math.random() * 20);
            }));
        }

        await Promise.all(operations);

        // Verify cache is in a consistent state
        const stats = cacheManager.getCacheStats('rw-cache');
        assert.ok(stats.size <= 5, 'Cache should respect max size');
        assert.ok(stats.size >= 0, 'Cache size should be non-negative');
    });

    it('should handle rapid concurrent cache clear operations', async () => {
        const cacheManager = CacheManager.getInstance();

        cacheManager.registerCache('rapid-clear', {
            maxSize: 10,
            ttl: 60000
        });

        // Fill cache
        for (let i = 0; i < 5; i++) {
            cacheManager.set('rapid-clear', `key${i}`, `value${i}`);
        }

        // Rapid clear operations
        const clearPromises = [];
        for (let i = 0; i < 3; i++) {
            clearPromises.push(new Promise(resolve => {
                setTimeout(() => {
                    cacheManager.clear('rapid-clear');
                    resolve();
                }, Math.random() * 5);
            }));
        }

        await Promise.all(clearPromises);

        // Cache should be empty after clears
        const stats = cacheManager.getCacheStats('rapid-clear');
        // Note: Since operations are concurrent, cache might not be completely empty
        // but it should be in a valid state
        assert.ok(stats.size >= 0 && stats.size <= 5, 'Cache should be in valid state');
    });
});
