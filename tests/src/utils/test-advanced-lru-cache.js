// Mock vscode is handled by require hook
const assert = require('assert');
const { AdvancedLruCache } = require('../../../out/utils/advanced-lru-cache.js');

describe('Advanced LRU Cache', () => {
    it('should support LRU-K algorithm with access history', () => {
        const cache = new AdvancedLruCache({
            maxSize: 3,
            ttlMs: 10000,
            lruK: 2, // Consider last 2 accesses
            evictionThreshold: 0.9
        });

        // Add initial items
        cache.set('item1', 'value1');
        cache.set('item2', 'value2');
        cache.set('item3', 'value3');

        // Access item1 twice to increase its priority
        cache.get('item1'); // First access
        cache.get('item1'); // Second access

        // Add a fourth item, which should trigger eviction
        // Since item1 was accessed recently twice, item2 or item3 should be evicted
        cache.set('item4', 'value4');

        // Item1 should still be in cache due to recent accesses
        assert.strictEqual(cache.get('item1'), 'value1', 'Most frequently accessed item should remain');

        // Cache size should be at max capacity
        assert.strictEqual(cache.size(), 3, 'Cache should maintain max size');
    });

    it('should handle TTL expiration correctly', () => {
        const cache = new AdvancedLruCache({
            maxSize: 5,
            ttlMs: 10, // 10ms TTL for testing
            lruK: 2
        });

        cache.set('expiringKey', 'expiringValue');

        // Wait for TTL to expire
        return new Promise(resolve => {
            setTimeout(() => {
                assert.strictEqual(cache.get('expiringKey'), undefined, 'Expired items should be removed');
                resolve();
            }, 20);
        });
    });

    it('should estimate memory usage correctly', () => {
        const cache = new AdvancedLruCache({
            maxSize: 5,
            ttlMs: 1000,
            lruK: 2,
            sizeEstimator: (key, value) => {
                // Custom size estimator that returns length of serialized data
                return JSON.stringify({key, value}).length;
            }
        });

        cache.set('small', 'x');
        const initialSize = cache.estimatedMemoryUsage();

        cache.set('larger', 'this is a much longer value');
        const newSize = cache.estimatedMemoryUsage();

        assert.ok(newSize > initialSize, 'Estimated memory should increase with larger values');
        assert.ok(cache.estimatedMemoryUsage() > 0, 'Estimated memory should be positive');
    });

    it('should respect eviction threshold', () => {
        const cache = new AdvancedLruCache({
            maxSize: 10,
            ttlMs: 1000,
            lruK: 2,
            evictionThreshold: 0.5, // Start evicting at 50% capacity
            sizeEstimator: (key, value) => 1 // Each item counts as size 1
        });

        // Add 6 items to a cache with maxSize 10 and evictionThreshold 0.5 (5 items)
        for (let i = 1; i <= 6; i++) {
            cache.set(`key${i}`, `value${i}`);
        }

        // Size should be limited by eviction threshold
        assert.ok(cache.size() <= 5, 'Cache size should respect eviction threshold');
    });

    it('should handle cache size limits correctly', () => {
        const cache = new AdvancedLruCache({
            maxSize: 3,
            ttlMs: 1000,
            lruK: 2
        });

        cache.set('key1', 'value1');
        cache.set('key2', 'value2');
        cache.set('key3', 'value3');
        cache.set('key4', 'value4'); // This should trigger LRU eviction

        assert.strictEqual(cache.size(), 3, 'Cache should not exceed max size');

        // The first key (key1) should have been evicted due to LRU policy
        // We accessed in order: key1, key2, key3, key4
        // So key1 should be the oldest and get evicted
        assert.strictEqual(cache.get('key1'), undefined, 'Oldest item should be evicted when maxSize reached');
    });
});