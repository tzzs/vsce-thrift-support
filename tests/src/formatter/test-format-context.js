'use strict';

const assert = require('assert');

const {ThriftParser} = require('../../../out/ast/parser.js');
const {ThriftNodeType} = require('../../../out/ast/nodes.types.js');
const {
    computeFormattingContext,
    DEFAULT_FORMATTING_CONTEXT
} = require('../../../out/formatter/format-context.js');

describe('core formatting context', () => {
    let originalParseContentWithCache;

    beforeEach(() => {
        originalParseContentWithCache = ThriftParser.parseContentWithCache;
    });

    afterEach(() => {
        ThriftParser.parseContentWithCache = originalParseContentWithCache;
    });

    it('returns an independent default context for empty input', () => {
        const result = computeFormattingContext('', 0);

        assert.deepStrictEqual(result, DEFAULT_FORMATTING_CONTEXT);
        assert.notStrictEqual(result, DEFAULT_FORMATTING_CONTEXT);
    });

    it('derives context from AST ranges', () => {
        ThriftParser.parseContentWithCache = () => ({
            body: [{
                type: ThriftNodeType.Struct,
                range: {start: {line: 0}, end: {line: 2}},
                fields: []
            }]
        });

        const result = computeFormattingContext('struct User {\n1: i32 id\n}', 1);

        assert.strictEqual(result.indentLevel, 1);
        assert.strictEqual(result.inStruct, true);
    });

    it('limits fallback scanning to the requested boundary', () => {
        ThriftParser.parseContentWithCache = () => ({body: []});
        const input = 'struct User {\n1: i32 id\n}\nenum Color {';

        const result = computeFormattingContext(input, 1);

        assert.strictEqual(result.indentLevel, 1);
        assert.strictEqual(result.inStruct, true);
        assert.strictEqual(result.inEnum, false);
    });

    it('ignores block markers after slash and hash comments', () => {
        ThriftParser.parseContentWithCache = () => ({body: []});
        const input = [
            '// struct CommentedOut {',
            '# enum AlsoCommentedOut {',
            'service Api { // } must not close the service'
        ].join('\n');

        const result = computeFormattingContext(input, 2);

        assert.strictEqual(result.indentLevel, 1);
        assert.strictEqual(result.inService, true);
        assert.strictEqual(result.inStruct, false);
        assert.strictEqual(result.inEnum, false);
    });

    it('handles very long comment markers without changing context', () => {
        ThriftParser.parseContentWithCache = () => ({body: []});
        const markerCount = 250_000;
        const input = `struct User {\n${'/'.repeat(markerCount)} }\n${'#'.repeat(markerCount)} }`;

        const startedAt = Date.now();
        const result = computeFormattingContext(input, 2);
        const elapsedMs = Date.now() - startedAt;

        assert.strictEqual(result.indentLevel, 1);
        assert.strictEqual(result.inStruct, true);
        assert.ok(elapsedMs < 1000, `comment scan took ${elapsedMs}ms`);
    });

    it('returns default context when parsing throws', () => {
        ThriftParser.parseContentWithCache = () => {
            throw new Error('parse failed');
        };

        const result = computeFormattingContext('invalid', 0);

        assert.deepStrictEqual(result, DEFAULT_FORMATTING_CONTEXT);
    });
});
