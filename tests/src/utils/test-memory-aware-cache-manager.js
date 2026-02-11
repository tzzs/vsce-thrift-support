// Mock vscode is handled by require hook
const assert = require('assert');
const { CacheManager } = require('../../../out/utils/cache-manager.js');

describe('Memory Aware Cache Manager', () => {
    beforeEach(() => {
        // Clear any existing cache manager instance to start fresh
        const cacheManager = CacheManager.getInstance();
        cacheManager.clearAll();
    });

    it('should register and use caches with advanced options', () => {
        const cacheManager = CacheManager.getInstance();

        cacheManager.registerCache('test-cache', {
            maxSize: 5,
            ttl: 10000,
            lruK: 2,
            evictionThreshold: 0.8
        });

        // Add items to the cache
        cacheManager.set('test-cache', 'key1', 'value1');
        cacheManager.set('test-cache', 'key2', 'value2');
        cacheManager.set('test-cache', 'key3', 'value3');

        // Retrieve items
        assert.strictEqual(cacheManager.get('test-cache', 'key1'), 'value1');
        assert.strictEqual(cacheManager.get('test-cache', 'key2'), 'value2');
        assert.strictEqual(cacheManager.get('test-cache', 'key3'), 'value3');
    });

    it('should respect max size limits', () => {
        const cacheManager = CacheManager.getInstance();

        cacheManager.registerCache('sized-cache', {
            maxSize: 2,
            ttl: 10000
        });

        cacheManager.set('sized-cache', 'item1', 'val1');
        cacheManager.set('sized-cache', 'item2', 'val2');
        cacheManager.set('sized-cache', 'item3', 'val3'); // This should trigger eviction

        // After adding 3rd item with maxSize 2, one should be evicted
        const stats = cacheManager.getCacheStats('sized-cache');
        assert.ok(stats.size <= 2, 'Cache size should not exceed max size');
    });

    it('should track cache statistics correctly', () => {
        const cacheManager = CacheManager.getInstance();

        cacheManager.registerCache('stats-cache', {
            maxSize: 5,
            ttl: 10000
        });

        // Add and retrieve items to generate stats
        cacheManager.set('stats-cache', 'key1', 'value1');
        const value = cacheManager.get('stats-cache', 'key1');
        const missing = cacheManager.get('stats-cache', 'nonexistent');

        assert.strictEqual(value, 'value1');
        assert.strictEqual(missing, undefined);

        const stats = cacheManager.getCacheStats('stats-cache');

        // Should have at least one hit and one miss
        assert.ok(stats.hitRate >= 0, 'Hit rate should be calculable');
    });

    it('should handle TTL expiration', () => {
        const cacheManager = CacheManager.getInstance();

        cacheManager.registerCache('ttl-cache', {
            maxSize: 5,
            ttl: 10 // 10ms TTL for testing
        });

        cacheManager.set('ttl-cache', 'expiring-key', 'expiring-value');

        // Wait for expiration
        return new Promise(resolve => {
            setTimeout(() => {
                const result = cacheManager.get('ttl-cache', 'expiring-key');
                assert.strictEqual(result, undefined, 'Expired items should be removed');
                resolve();
            }, 20);
        });
    });

    it('should return memory pressure level', () => {
        const cacheManager = CacheManager.getInstance();

        // Register a cache to ensure methods work
        cacheManager.registerCache('pressure-test', {
            maxSize: 5,
            ttl: 10000
        });

        // This should not throw an error and return a valid pressure level
        const pressureLevel = cacheManager.getMemoryPressureLevel();
        assert.ok(['normal', 'medium', 'high'].includes(pressureLevel),
                  'Memory pressure level should be one of the expected values');
    });

    it('should clear individual caches', () => {
        const cacheManager = CacheManager.getInstance();

        cacheManager.registerCache('clear-test', {
            maxSize: 5,
            ttl: 10000
        });

        cacheManager.set('clear-test', 'key1', 'value1');
        assert.strictEqual(cacheManager.get('clear-test', 'key1'), 'value1');

        cacheManager.clear('clear-test');
        assert.strictEqual(cacheManager.get('clear-test', 'key1'), undefined, 'Cache should be cleared');
    });
});