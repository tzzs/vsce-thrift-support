const assert = require('assert');
const vscode = require('vscode');
const {IncrementalParserManager, setupIncrementalParsingTracking} = require('../../out/utils/incremental-parser.js');
const {IncrementalTracker, ChangeType} = require('../../out/utils/incremental-tracker.js');
const {LineRange} = require('../../out/utils/line-range.js');

describe('IncrementalParserManager', () => {
    beforeEach(() => {
        // No-op: reset tracker state between tests
    });

    function createMockDocument(thriftContent) {
        const lines = thriftContent.split(/\r?\n/);
        return {
            getText: () => thriftContent,
            uri: {
                toString: () => 'test-incremental.thrift',
                fsPath: '/tmp/test-incremental.thrift',
                scheme: 'file'
            },
            languageId: 'thrift',
            lineCount: lines.length,
            lineAt: (line) => ({text: lines[line] || ''})
        };
    }

    describe('getInstance()', () => {
        it('should return singleton instance', () => {
            const a = IncrementalParserManager.getInstance();
            const b = IncrementalParserManager.getInstance();
            assert.strictEqual(a, b);
        });
    });

    describe('parseFull()', () => {
        it('should perform full parsing and return IncrementalParseResult', async () => {
            const doc = createMockDocument('struct A { 1: i32 id }\nstruct B { 1: string name }');
            const manager = IncrementalParserManager.getInstance();
            const result = await manager.parseIncrementally(doc);
            assert.ok(result !== null);
            assert.ok(result.ast !== null);
            assert.ok(Array.isArray(result.affectedNodes));
            assert.ok(Array.isArray(result.newNodes));
        });
    });

    describe('parseWithPerformanceComparison()', () => {
        it('should compare full and incremental parse performance', async () => {
            const doc = createMockDocument('struct A { 1: i32 id }\nstruct B { 1: string name }');
            const manager = IncrementalParserManager.getInstance();
            const result = await manager.parseWithPerformanceComparison(doc);
            assert.ok(result.result !== null);
            assert.strictEqual(typeof result.wasIncremental, 'boolean');
            assert.strictEqual(typeof result.improvement, 'number');
        });

        it('should use incremental parse when dirtyRange provided', async () => {
            const doc = createMockDocument('struct A { 1: i32 id }\nstruct B { 1: string name }');
            const manager = IncrementalParserManager.getInstance();
            const dirtyRange = {startLine: 0, endLine: 1};
            const result = await manager.parseWithPerformanceComparison(doc, dirtyRange);
            assert.ok(result.result !== null);
            assert.ok(result.wasIncremental);
        });
    });

    describe('setupIncrementalParsingTracking()', () => {
        it('should register a disposables subscription', () => {
            const subs = [];
            const context = {subscriptions: subs};
            setupIncrementalParsingTracking(context);
            assert.ok(subs.length > 0, 'should push at least one disposable');
        });
    });
});
