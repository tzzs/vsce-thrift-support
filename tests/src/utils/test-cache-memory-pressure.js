const assert = require('assert');
const {CacheManager} = require('../../../out/utils/cache-manager.js');
const {MemoryMonitor} = require('../../../out/utils/memory-monitor.js');

describe('cache-manager-memory-pressure', () => {
    it('should trigger cleanup when memory usage is high', () => {
        const cacheManager = CacheManager.getInstance();
        cacheManager.clearAll();
        cacheManager.registerCache('pressure-cache', {maxSize: 10, ttl: 100000});

        const memoryMonitor = MemoryMonitor.getInstance();
        const originalGetCurrent = memoryMonitor.getCurrentUsage;
        const originalGetPeak = memoryMonitor.getPeakUsage;
        const originalRecord = memoryMonitor.recordMemoryUsage;
        const originalAggressive = cacheManager.performAggressiveCleanup;

        let aggressiveCalled = false;

        try {
            memoryMonitor.getCurrentUsage = () => 90;
            memoryMonitor.getPeakUsage = () => 100;
            memoryMonitor.recordMemoryUsage = () => {};

            cacheManager.performAggressiveCleanup = () => {
                aggressiveCalled = true;
            };

            cacheManager.memoryCheckInterval = 0;
            cacheManager.lastMemoryCheck = 0;

            cacheManager.set('pressure-cache', 'key-1', {value: 1});

            assert.ok(aggressiveCalled, 'Should perform aggressive cleanup under high memory pressure');
        } finally {
            memoryMonitor.getCurrentUsage = originalGetCurrent;
            memoryMonitor.getPeakUsage = originalGetPeak;
            memoryMonitor.recordMemoryUsage = originalRecord;
            cacheManager.performAggressiveCleanup = originalAggressive;
        }
    });
});
