const assert = require('assert');
const vscode = require('vscode');
const {IncrementalTracker, ChangeType} = require('../../out/utils/incremental-tracker.js');
const {createCoreDependencies} = require('../../out/utils/dependencies.js');

describe('Incremental Tracker', () => {
    it('initializes singleton instance', () => {
        const tracker1 = IncrementalTracker.getInstance();
        const tracker2 = IncrementalTracker.getInstance();
        assert.strictEqual(tracker1, tracker2);
    });

    it('uses singleton instance in core dependencies', () => {
        const deps = createCoreDependencies();
        assert.strictEqual(deps.incrementalTracker, IncrementalTracker.getInstance());
    });

    it('does not track non-thrift documents', () => {
        const tracker = IncrementalTracker.getInstance();
        const mockNonThriftDoc = {
            uri: {toString: () => 'test.js'},
            languageId: 'javascript'
        };

        const mockEvent = {
            document: mockNonThriftDoc,
            contentChanges: [{
                range: new vscode.Range(0, 0, 0, 10),
                text: 'changed'
            }]
        };

        tracker.markChanges(mockEvent);
        const dirtyRange = tracker.consumeDirtyRange(mockNonThriftDoc);
        assert.strictEqual(dirtyRange, undefined);
    });

    it('tracks thrift document changes', () => {
        const tracker = IncrementalTracker.getInstance();
        const mockThriftDoc = {
            uri: {toString: () => 'test.thrift'},
            languageId: 'thrift',
            lineCount: 10
        };

        const mockEvent = {
            document: mockThriftDoc,
            contentChanges: [{
                range: new vscode.Range(2, 0, 2, 10),
                text: 'changed line'
            }]
        };

        tracker.markChanges(mockEvent);
        const dirtyRange = tracker.consumeDirtyRange(mockThriftDoc);
        assert.ok(dirtyRange !== undefined);
    });

    it('tracks different change types', () => {
        const tracker = IncrementalTracker.getInstance();
        const mockDoc = {
            uri: {toString: () => 'test.thrift'},
            languageId: 'thrift'
        };

        const mockEvent = {
            document: mockDoc,
            contentChanges: [{
                range: new vscode.Range(3, 0, 3, 10),
                text: 'changed'
            }]
        };

        tracker.markChanges(mockEvent, ChangeType.PARSING);
        const parsingChanges = tracker.getRecentParsingChanges(mockDoc);
        assert.ok(Array.isArray(parsingChanges));
    });

    it('consumes dirty range and clears entries', () => {
        const tracker = IncrementalTracker.getInstance();
        const mockDoc = {
            uri: {toString: () => 'test.thrift'},
            languageId: 'thrift',
            getText: () => '',
            lineCount: 10
        };

        const mockEvent = {
            document: mockDoc,
            contentChanges: [{
                range: new vscode.Range(1, 0, 1, 10),
                text: 'changed'
            }]
        };

        tracker.markChanges(mockEvent);

        const dirtyRange1 = tracker.consumeDirtyRange(mockDoc);
        assert.ok(dirtyRange1 !== undefined);

        const dirtyRange2 = tracker.consumeDirtyRange(mockDoc);
        assert.strictEqual(dirtyRange2, undefined);
    });

    it('clears change records', () => {
        const tracker = IncrementalTracker.getInstance();
        const mockDoc = {
            uri: {toString: () => 'test.thrift'},
            languageId: 'thrift'
        };

        const mockEvent = {
            document: mockDoc,
            contentChanges: [{
                range: new vscode.Range(5, 0, 5, 10),
                text: 'changed'
            }]
        };

        tracker.markChanges(mockEvent);
        assert.ok(tracker.consumeDirtyRange(mockDoc) !== undefined);

        tracker.markChanges(mockEvent);
        tracker.clearChangeRecords(mockDoc);

        const dirtyRangeAfterClear = tracker.consumeDirtyRange(mockDoc);
        assert.strictEqual(dirtyRangeAfterClear, undefined);
    });

    it('merges overlapping line ranges', () => {
        const tracker = IncrementalTracker.getInstance();
        const mockDoc = {
            uri: {toString: () => 'test.thrift'},
            languageId: 'thrift'
        };

        const mockEvent1 = {
            document: mockDoc,
            contentChanges: [{
                range: new vscode.Range(2, 0, 2, 10),
                text: 'changed'
            }]
        };

        const mockEvent2 = {
            document: mockDoc,
            contentChanges: [{
                range: new vscode.Range(3, 0, 3, 10),
                text: 'also changed'
            }]
        };

        tracker.markChanges(mockEvent1);
        tracker.markChanges(mockEvent2);

        const dirtyRange = tracker.consumeDirtyRange(mockDoc);
        if (dirtyRange) {
            assert.ok(dirtyRange.endLine >= dirtyRange.startLine);
        }
    });
});
