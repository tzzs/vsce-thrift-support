const assert = require('assert');
const {ErrorHandler} = require('../../../out/utils/error-handler.js');

describe('ErrorHandler comprehensive', () => {
    let handler;

    beforeEach(() => {
        handler = new ErrorHandler();
    });

    describe('singleton', () => {
        it('should return same instance from getInstance()', () => {
            const a = ErrorHandler.getInstance();
            const b = ErrorHandler.getInstance();
            assert.strictEqual(a, b);
        });
    });

    describe('handleError()', () => {
        it('should handle Error instance', () => {
            handler.handleError(new Error('test error'), {
                component: 'TestComp',
                operation: 'testOp'
            });
            const stats = handler.getErrorStats();
            assert.strictEqual(stats.total, 1);
            assert.strictEqual(stats.byComponent.get('TestComp'), 1);
        });

        it('should handle string error', () => {
            handler.handleError('string error', {
                component: 'TestComp',
                operation: 'testOp'
            });
            const stats = handler.getErrorStats();
            assert.strictEqual(stats.total, 1);
        });

        it('should handle unknown error type gracefully', () => {
            handler.handleError(42, {
                component: 'TestComp',
                operation: 'testOp'
            });
            const stats = handler.getErrorStats();
            assert.strictEqual(stats.total, 1);
        });

        it('should track errors by component', () => {
            handler.handleError(new Error('e1'), {component: 'CompA', operation: 'op1'});
            handler.handleError(new Error('e2'), {component: 'CompA', operation: 'op2'});
            handler.handleError(new Error('e3'), {component: 'CompB', operation: 'op1'});
            const stats = handler.getErrorStats();
            assert.strictEqual(stats.byComponent.get('CompA'), 2);
            assert.strictEqual(stats.byComponent.get('CompB'), 1);
        });

        it('should track errors by operation', () => {
            handler.handleError(new Error('e1'), {component: 'C', operation: 'op1'});
            handler.handleError(new Error('e2'), {component: 'C', operation: 'op1'});
            const stats = handler.getErrorStats();
            assert.strictEqual(stats.byOperation.get('op1'), 2);
        });

        it('should aggregate repeated errors', () => {
            const ctx = {component: 'C', operation: 'op'};
            handler.handleError(new Error('same'), ctx);
            handler.handleError(new Error('same'), ctx);
            handler.handleError(new Error('same'), ctx);
            const aggs = handler.getErrorAggregations();
            assert.ok(aggs.size >= 1);
            let found = false;
            for (const [, agg] of aggs) {
                if (agg.count >= 3) {
                    found = true;
                    break;
                }
            }
            assert.ok(found, 'should find aggregated error with count >= 3');
        });

        it('should show notification for user-triggered operations', () => {
            const vscode = require('vscode');
            let shown = false;
            const origShowError = vscode.window.showErrorMessage;
            vscode.window.showErrorMessage = () => {
                shown = true;
                return Promise.resolve(undefined);
            };
            try {
                handler.handleError(new Error('user error'), {
                    component: 'Provider',
                    operation: 'provideHover'
                });
                assert.ok(shown, 'should show error notification');
            } finally {
                vscode.window.showErrorMessage = origShowError;
            }
        });
    });

    describe('handleWarning()', () => {
        it('should increment warning count', () => {
            handler.handleWarning('test warning', {component: 'C', operation: 'op'});
            const stats = handler.getErrorStats();
            assert.strictEqual(stats.warnings, 1);
        });

        it('should not increment total error count', () => {
            handler.handleWarning('warning', {component: 'C', operation: 'op'});
            const stats = handler.getErrorStats();
            assert.strictEqual(stats.total, 0);
        });
    });

    describe('handleInfo()', () => {
        it('should increment info count', () => {
            handler.handleInfo('test info', {component: 'C', operation: 'op'});
            const stats = handler.getErrorStats();
            assert.strictEqual(stats.infos, 1);
        });

        it('should not increment total error count', () => {
            handler.handleInfo('info', {component: 'C', operation: 'op'});
            const stats = handler.getErrorStats();
            assert.strictEqual(stats.total, 0);
        });
    });

    describe('safe()', () => {
        it('should return function result on success', () => {
            assert.strictEqual(handler.safe(() => 42, 0), 42);
        });

        it('should return fallback on exception', () => {
            assert.strictEqual(handler.safe(() => { throw new Error('boom'); }, 'fallback'), 'fallback');
        });
    });

    describe('wrapSync()', () => {
        it('should return function result on success', () => {
            const result = handler.wrapSync(() => 99, {component: 'C', operation: 'op'});
            assert.strictEqual(result, 99);
        });

        it('should return fallback on exception', () => {
            const result = handler.wrapSync(() => { throw new Error('boom'); }, {component: 'C', operation: 'op'}, 'fallback');
            assert.strictEqual(result, 'fallback');
            const stats = handler.getErrorStats();
            assert.strictEqual(stats.total, 1);
        });

        it('should throw on exception when no fallback provided', () => {
            assert.throws(() => {
                handler.wrapSync(() => { throw new Error('boom'); }, {component: 'C', operation: 'op'});
            });
        });
    });

    describe('wrapAsync()', () => {
        it('should return function result on success', async () => {
            const result = await handler.wrapAsync(async () => 99, {component: 'C', operation: 'op'});
            assert.strictEqual(result, 99);
        });

        it('should return fallback on exception', async () => {
            const result = await handler.wrapAsync(async () => { throw new Error('boom'); }, {component: 'C', operation: 'op'}, 'fallback');
            assert.strictEqual(result, 'fallback');
            const stats = handler.getErrorStats();
            assert.strictEqual(stats.total, 1);
        });

        it('should throw on exception when no fallback provided', async () => {
            try {
                await handler.wrapAsync(async () => { throw new Error('boom'); }, {component: 'C', operation: 'op'});
                assert.fail('should have thrown');
            } catch (error) {
                assert.ok(error instanceof Error);
            }
        });
    });

    describe('getErrorStats()', () => {
        it('should return stats with byComponent and byOperation maps', () => {
            const stats = handler.getErrorStats();
            assert.strictEqual(typeof stats.total, 'number');
            assert.ok(stats.byComponent instanceof Map);
            assert.ok(stats.byOperation instanceof Map);
        });
    });

    describe('getErrorAggregations()', () => {
        it('should return a copy of the aggregation map', () => {
            handler.handleError(new Error('e'), {component: 'C', operation: 'op'});
            handler.handleError(new Error('e'), {component: 'C', operation: 'op'});
            const aggs = handler.getErrorAggregations();
            assert.ok(aggs instanceof Map);
            assert.ok(aggs.size >= 1);
        });
    });

    describe('resetStats()', () => {
        it('should reset all stats and aggregations', () => {
            handler.handleError(new Error('e'), {component: 'C', operation: 'op'});
            handler.handleWarning('w', {component: 'C', operation: 'op'});
            handler.resetStats();
            const stats = handler.getErrorStats();
            assert.strictEqual(stats.total, 0);
            assert.strictEqual(stats.warnings, 0);
            assert.strictEqual(stats.infos, 0);
            assert.strictEqual(handler.getErrorAggregations().size, 0);
        });
    });
});
