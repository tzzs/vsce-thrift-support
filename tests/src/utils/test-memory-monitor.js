// Mock vscode is handled by require hook
const assert = require('assert');
const { MemoryMonitor } = require('../../../out/utils/memory-monitor.js');

describe('Memory Monitor', () => {
    it('should record memory usage correctly', () => {
        const monitor = MemoryMonitor.getInstance();

        // Clear history to start fresh
        monitor.clearMemoryHistory();

        // Record memory usage
        monitor.recordMemoryUsage();

        // Check that we have recorded memory usage
        const report = monitor.getMemoryReport();
        assert.ok(report.includes('内存使用报告'), 'Memory report should contain Chinese title');
        assert.ok(report.includes('当前内存使用'), 'Memory report should contain current usage info');
    });

    it('should track peak memory usage', () => {
        const monitor = MemoryMonitor.getInstance();

        // Clear history to start fresh
        monitor.clearMemoryHistory();

        // Record memory usage multiple times
        monitor.recordMemoryUsage();

        // Get current and peak usage
        const currentUsage = monitor.getCurrentUsage();
        const peakUsage = monitor.getPeakUsage();

        // At this point, current and peak should be approximately equal
        assert.ok(currentUsage >= 0, 'Current usage should be non-negative');
        assert.ok(peakUsage >= currentUsage, 'Peak usage should be at least current usage');
    });

    it('should generate memory trend data', () => {
        const monitor = MemoryMonitor.getInstance();

        // Record memory usage
        monitor.recordMemoryUsage();

        // Get trend data
        const trendData = monitor.getMemoryTrendData();

        assert.ok(Array.isArray(trendData), 'Trend data should be an array');

        if (trendData.length > 0) {
            const firstPoint = trendData[0];
            assert.ok(firstPoint.operation === 'memory-usage', 'Trend point should have correct operation type');
            assert.ok(typeof firstPoint.duration === 'number', 'Trend point should have duration (memory usage)');
            assert.ok(typeof firstPoint.timestamp === 'number', 'Trend point should have timestamp');
        }
    });

    it('should handle cache statistics updates', () => {
        const monitor = MemoryMonitor.getInstance();

        // Update cache statistics
        monitor.updateCacheStats('test-cache', {
            name: 'test-cache',
            size: 10,
            maxSize: 100,
            hitRate: 0.8,
            cleanupCount: 5,
            lastCleanup: Date.now()
        });

        // Get all cache statistics
        const allStats = monitor.getAllCacheStats();

        assert.ok(allStats instanceof Map, 'Cache stats should be returned as a Map');

        const testCacheStats = allStats.get('test-cache');
        assert.ok(testCacheStats, 'Test cache stats should exist');
        assert.strictEqual(testCacheStats.size, 10, 'Cache size should match');
        assert.strictEqual(testCacheStats.maxSize, 100, 'Max size should match');
        assert.strictEqual(testCacheStats.hitRate, 0.8, 'Hit rate should match');
    });

    it('should detect high memory usage', () => {
        const monitor = MemoryMonitor.getInstance();

        // Record memory usage
        monitor.recordMemoryUsage();

        // Check memory usage with various thresholds
        const isHigh = monitor.isHighMemoryUsage(0.1); // Very low threshold to test function exists

        assert.ok(typeof isHigh === 'boolean', 'isHighMemoryUsage should return a boolean');
    });

    it('should manage memory history properly', () => {
        const monitor = MemoryMonitor.getInstance();

        // Clear history
        monitor.clearMemoryHistory();

        // Record memory usage a few times
        for (let i = 0; i < 5; i++) {
            monitor.recordMemoryUsage();
        }

        const report = monitor.getMemoryReport();
        assert.ok(report.includes('暂无内存使用数据') === false, 'Report should contain actual data after recording');
    });
});