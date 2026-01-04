const {createVscodeMock, installVscodeMock} = require('../../mock_vscode.js');

const vscode = createVscodeMock({
    window: {
        showErrorMessage: () => Promise.resolve(undefined),
        showInformationMessage: () => Promise.resolve(undefined),
        createOutputChannel: () => ({
            appendLine: () => {},
            show: () => {}
        })
    },
    workspace: {
        asRelativePath: (value) => value
    }
});
installVscodeMock(vscode);

const {PerformanceMonitor} = require('../../../out/performance-monitor.js');

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

function findStat(stats, name) {
    return stats.find((stat) => stat.operation === name);
}

async function run() {
    console.log('=== Running PerformanceMonitor Tests ===\n');

    PerformanceMonitor.clearMetrics();

    PerformanceMonitor.measure('opA', () => 1);
    PerformanceMonitor.measure('opA', () => 2);
    PerformanceMonitor.measure('opB', () => 3);

    const stats = PerformanceMonitor.getOperationStats();
    const opA = findStat(stats, 'opA');
    const opB = findStat(stats, 'opB');

    assert(opA && opA.count === 2, 'Expected opA count to be 2');
    assert(opB && opB.count === 1, 'Expected opB count to be 1');
    assert(opA.avgDuration > 0, 'Expected opA avg duration to be > 0');
    assert(opA.p95Duration >= opA.minDuration, 'Expected p95 >= min duration');
    assert(opA.maxDuration >= opA.p95Duration, 'Expected max >= p95 duration');

    const report = PerformanceMonitor.getPerformanceReport();
    assert(report.includes('操作统计'), 'Expected report to include operation stats');
    assert(report.includes('opA'), 'Expected report to include opA');

    PerformanceMonitor.clearMetrics();
    const emptyReport = PerformanceMonitor.getPerformanceReport();
    assert(emptyReport === '暂无性能数据', 'Expected empty report when no metrics exist');

    console.log('✅ PerformanceMonitor tests passed!');
}

run().catch((error) => {
    console.error('❌ PerformanceMonitor tests failed:', error.message);
    process.exit(1);
});
