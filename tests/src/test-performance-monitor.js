const assert = require('assert');
const {performanceMonitor} = require('../../out/performance-monitor.js');

describe('Performance Monitor', () => {
    beforeEach(() => {
        performanceMonitor.clearMetrics();
    });

    it('measures synchronous operation', () => {
        const result = performanceMonitor.measure('test-operation', () => 'success');
        assert.strictEqual(result, 'success');

        const stats = performanceMonitor.getOperationStats();
        const testOp = stats.find(op => op.operation === 'test-operation');
        assert.ok(testOp !== undefined);
        assert.strictEqual(testOp.count, 1);
    });

    it('measures asynchronous operation', async () => {
        const result = await performanceMonitor.measureAsync('async-test-operation', async () => 'async-success');
        assert.strictEqual(result, 'async-success');

        const stats = performanceMonitor.getOperationStats();
        const testOp = stats.find(op => op.operation === 'async-test-operation');
        assert.ok(testOp !== undefined);
        assert.strictEqual(testOp.count, 1);
    });

    it('collects metrics', () => {
        performanceMonitor.measure('metric-test', () => 42);

        const stats = performanceMonitor.getOperationStats();
        const testOp = stats.find(op => op.operation === 'metric-test');

        assert.ok(testOp !== undefined);
        assert.strictEqual(testOp.count, 1);
        assert.ok(testOp.avgDuration >= 0);
    });

    it('generates performance report', () => {
        performanceMonitor.measure('report-test', () => 'test');

        const report = performanceMonitor.getPerformanceReport();
        assert.ok(report.includes('Thrift Support 性能报告'));
        assert.ok(report.includes('report-test'));
        assert.ok(report.length > 0);
    });

    it('clears metrics', () => {
        performanceMonitor.measure('before-clear', () => 'test');

        let stats = performanceMonitor.getOperationStats();
        assert.ok(stats.length > 0);

        performanceMonitor.clearMetrics();
        stats = performanceMonitor.getOperationStats();
        assert.strictEqual(stats.length, 0);
    });

    it('tracks slow operations', () => {
        performanceMonitor.measure('normal-op', () => 'normal');

        const slowOps = performanceMonitor.getSlowOperationStats();
        assert.ok(Array.isArray(slowOps));
    });

    it('calculates percentiles', () => {
        for (let i = 0; i < 5; i++) {
            performanceMonitor.measure(`multi-test-${i}`, () => `result-${i}`);
        }

        const stats = performanceMonitor.getOperationStats();
        const multiOp = stats.find(op => op.operation.includes('multi-test'));
        if (multiOp) {
            assert.ok(multiOp.count >= 1);
            assert.ok(typeof multiOp.avgDuration === 'number');
            assert.ok(typeof multiOp.p95Duration === 'number');
        }
    });

    it('measures incremental parsing', () => {
        const mockDocument = {
            uri: {toString: () => 'test.thrift'},
            getText: () => 'struct Test {}'
        };
        const result = performanceMonitor.measureIncrementalParsing(
            () => 'full-result',
            () => 'incremental-result',
            mockDocument,
            {startLine: 0, endLine: 5}
        );

        assert.strictEqual(result.result, 'incremental-result');
        assert.strictEqual(result.wasIncremental, true);
        assert.ok(typeof result.improvement === 'number');
    });

    it('falls back to full parsing when no range provided', () => {
        const result = performanceMonitor.measureIncrementalParsing(
            () => 'full-result',
            () => 'incremental-result',
            undefined
        );

        assert.strictEqual(result.result, 'full-result');
        assert.strictEqual(result.wasIncremental, false);
        assert.ok(typeof result.improvement === 'number');
    });
});
