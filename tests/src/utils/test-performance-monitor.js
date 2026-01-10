const {createPerformanceMonitor} = require('../../../out/performance-monitor.js');

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

function findStat(stats, name) {
    return stats.find((stat) => stat.operation === name);
}

async function run() {

    const monitor = createPerformanceMonitor();
    monitor.clearMetrics();

    monitor.measure('opA', () => 1);
    monitor.measure('opA', () => 2);
    monitor.measure('opB', () => 3);

    const stats = monitor.getOperationStats();
    const opA = findStat(stats, 'opA');
    const opB = findStat(stats, 'opB');

    assert(opA && opA.count === 2, 'Expected opA count to be 2');
    assert(opB && opB.count === 1, 'Expected opB count to be 1');
    assert(opA.avgDuration > 0, 'Expected opA avg duration to be > 0');
    assert(opA.p95Duration >= opA.minDuration, 'Expected p95 >= min duration');
    assert(opA.maxDuration >= opA.p95Duration, 'Expected max >= p95 duration');

    const report = monitor.getPerformanceReport();
    assert(report.includes('操作统计'), 'Expected report to include operation stats');
    assert(report.includes('opA'), 'Expected report to include opA');

    monitor.clearMetrics();
    const emptyReport = monitor.getPerformanceReport();

    const warnings = [];
    const fakeErrorHandler = {
        handleWarning: (message, context) => {
            warnings.push({message, context});
        }
    };
    const injectedMonitor = createPerformanceMonitor({
        errorHandler: fakeErrorHandler,
        slowOperationThreshold: 0
    });
    injectedMonitor.measure('slow-op', () => 1);
    assert(warnings.length > 0, 'Expected injected error handler to receive warning');
    assert(emptyReport === '暂无性能数据', 'Expected empty report when no metrics exist');

}

describe('performance-monitor', () => {
    it('should pass all test assertions', async () => {
        await run();
    });
});