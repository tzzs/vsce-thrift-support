const assert = require('assert');
const {AnalysisScheduler} = require('../../../out/diagnostics/scheduler.js');

describe('diagnostics-scheduler-reschedule', () => {
    it('should rerun analysis when scheduled during processing', async () => {
        const scheduler = new AnalysisScheduler();
        const doc = {
            uri: {toString: () => 'file:///test.thrift'},
            version: 1
        };

        let runCount = 0;
        let release;
        const gate = new Promise((resolve) => {
            release = resolve;
        });

        const runTask = async () => {
            runCount++;
            if (runCount === 1) {
                await gate;
            }
        };

        const scheduledFirst = scheduler.schedule(
            doc,
            {immediate: true},
            runTask,
            () => {}
        );

        assert.ok(scheduledFirst, 'First schedule should succeed');

        await new Promise((resolve) => setTimeout(resolve, 10));

        doc.version = 2;
        const scheduledSecond = scheduler.schedule(
            doc,
            {immediate: true, throttleState: {isAnalyzing: true, version: 1}},
            runTask,
            () => {}
        );

        assert.ok(scheduledSecond, 'Second schedule should be queued for rerun');

        release();

        await new Promise((resolve) => setTimeout(resolve, 20));

        assert.strictEqual(runCount, 2, 'Should run analysis twice');
        scheduler.dispose();
    });

    it('should clear pending reschedule when cancelled', async () => {
        const scheduler = new AnalysisScheduler();
        const doc = {
            uri: {toString: () => 'file:///test-cancel.thrift'},
            version: 1
        };

        let release;
        const gate = new Promise((resolve) => {
            release = resolve;
        });

        const runTask = async () => {
            await gate;
        };

        scheduler.schedule(doc, {immediate: true}, runTask, () => {});

        await new Promise((resolve) => setTimeout(resolve, 10));

        doc.version = 2;
        scheduler.schedule(
            doc,
            {immediate: true, throttleState: {isAnalyzing: true, version: 1}},
            runTask,
            () => {}
        );

        scheduler.cancel(doc);
        assert.strictEqual(scheduler.getQueuedCount(), 0, 'Queued count should be cleared after cancel');

        release();
        await new Promise((resolve) => setTimeout(resolve, 20));
        scheduler.dispose();
    });

    it('should include pending analyses in queued count', async () => {
        const scheduler = new AnalysisScheduler();
        const docA = {
            uri: {toString: () => 'file:///queued-a.thrift'},
            version: 1
        };
        const docB = {
            uri: {toString: () => 'file:///queued-b.thrift'},
            version: 1
        };

        let release;
        const gate = new Promise((resolve) => {
            release = resolve;
        });

        const runTask = async () => {
            await gate;
        };

        // 需要调度3个以上的文档才能触发排队，因为maxConcurrentAnalyses现在是3
        scheduler.schedule(docA, {immediate: true}, runTask, () => {});
        scheduler.schedule(docB, {immediate: true}, runTask, () => {});

        const docC = {
            uri: {toString: () => 'file:///queued-c.thrift'},
            version: 1
        };
        const docD = {
            uri: {toString: () => 'file:///queued-d.thrift'},
            version: 1
        };

        scheduler.schedule(docC, {immediate: true}, runTask, () => {});
        scheduler.schedule(docD, {immediate: true}, runTask, () => {});

        await new Promise((resolve) => setTimeout(resolve, 10));

        // 前3个应该立即执行，第4个应该排队
        assert.ok(
            scheduler.getQueuedCount() >= 1,
            'Queued count should include pending analyses waiting on slots'
        );

        release();
        await new Promise((resolve) => setTimeout(resolve, 20));
        scheduler.dispose();
    });
});
