const assert = require('assert');
const {createPerformanceMonitor} = require('../../../out/performance-monitor.js');
const {MemoryMonitor} = require('../../../out/utils/memory-monitor.js');

describe('performance-monitor-memory', () => {
    it('should record memory usage before and after sync measure', () => {
        const memoryMonitor = MemoryMonitor.getInstance();
        memoryMonitor.clearMemoryHistory();

        const monitor = createPerformanceMonitor();
        const before = memoryMonitor.getMemoryTrendData().length;
        monitor.measure('sync-test', () => 42);
        const after = memoryMonitor.getMemoryTrendData().length;

        assert.strictEqual(after - before, 2, 'Sync measure should record two memory samples');
    });

    it('should record memory usage before and after async measure', async () => {
        const memoryMonitor = MemoryMonitor.getInstance();
        memoryMonitor.clearMemoryHistory();

        const monitor = createPerformanceMonitor();
        const before = memoryMonitor.getMemoryTrendData().length;
        await monitor.measureAsync('async-test', async () => {
            return 42;
        });
        const after = memoryMonitor.getMemoryTrendData().length;

        assert.strictEqual(after - before, 2, 'Async measure should record two memory samples');
    });
});
