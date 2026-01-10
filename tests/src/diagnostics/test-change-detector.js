const assert = require('assert');

const {getDirtyChangeSummary} = require('../../../out/diagnostics/change-detector.js');

describe('change-detector', () => {
    function createDoc(text, name) {
        const lines = text.split('\n');
        return {
            uri: {fsPath: `/tmp/${name}`},
            languageId: 'thrift',
            version: 1,
            lineCount: lines.length,
            getText: () => text,
            lineAt: (i) => ({text: lines[i] || ''})
        };
    }

    function createChange(startLine, startChar, endLine, endChar, text) {
        return {
            range: {
                start: {line: startLine, character: startChar},
                end: {line: endLine, character: endChar}
            },
            text
        };
    }

    it('should detect simple type change without structural change', () => {
        const doc = createDoc(
            [
                'struct A {',
                '  1: i32 id,',
                '}',
                ''
            ].join('\n'),
            'change-detector.thrift'
        );

        const simpleChange = createChange(1, 5, 1, 8, 'i64');
        const simpleSummary = getDirtyChangeSummary(doc, [simpleChange]);

        assert.strictEqual(simpleSummary.includesMayChange, false);
        assert.strictEqual(simpleSummary.structuralChange, false);
        assert.strictEqual(simpleSummary.dirtyLineCount, 0);
        assert.deepStrictEqual(simpleSummary.mergedDirtyRanges, [{startLine: 1, endLine: 1}]);
        assert.deepStrictEqual(simpleSummary.dirtyRange, {startLine: 1, endLine: 1});
    });

    it('should detect include and structural changes', () => {
        const doc = createDoc(
            [
                'struct A {',
                '  1: i32 id,',
                '}',
                ''
            ].join('\n'),
            'change-detector.thrift'
        );

        const simpleChange = createChange(1, 5, 1, 8, 'i64');
        const includeChange = createChange(3, 0, 3, 0, 'include "a.thrift"\n');
        const multiSummary = getDirtyChangeSummary(doc, [simpleChange, includeChange]);

        assert.strictEqual(multiSummary.includesMayChange, true);
        assert.strictEqual(multiSummary.structuralChange, true);
        assert.strictEqual(multiSummary.dirtyLineCount, 1);
        assert.deepStrictEqual(
            multiSummary.mergedDirtyRanges,
            [
                {startLine: 1, endLine: 1},
                {startLine: 3, endLine: 4}
            ]
        );
        assert.deepStrictEqual(multiSummary.dirtyRange, {startLine: 1, endLine: 4});
    });
});