const assert = require('assert');

const {DiagnosticManager} = require('../../../out/diagnostics');

describe('performance-monitor-di', () => {
    function createDoc(name) {
        const fsPath = `/tmp/${name}`;
        return {
            languageId: 'thrift',
            uri: {
                fsPath,
                toString: () => fsPath
            },
            version: 1,
            getText: () => 'struct User { 1: i32 id }\n'
        };
    }

    it('should use injected PerformanceMonitor', async () => {
        let called = 0;
        let lastOperation = '';
        const performanceMonitor = {
            measureAsync: async (operation, fn) => {
                called += 1;
                lastOperation = operation;
                return await fn();
            }
        };

        const manager = new DiagnosticManager(undefined, performanceMonitor);
        const doc = createDoc('perf-di.thrift');

        await manager.performAnalysis(doc);

        assert.strictEqual(called, 1, 'Should use injected PerformanceMonitor');
        assert.strictEqual(lastOperation, 'Thrift诊断分析', 'Should have correct operation label');
    });
});