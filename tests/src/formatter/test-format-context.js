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

    it('does not treat a closed block as open when boundary is its closing brace', () => {
        const content = 'struct A {\n  1: i32 x\n}\n\nenum B {\n  X = 0\n}\n';
        const lines = content.split('\n');
        // boundary = 3 (blank line right after struct A's closing brace): not inside struct A
        const ctx = computeFormattingContext(lines.slice(0, 4).join('\n'), 3, 'closed-boundary-1');
        assert.strictEqual(ctx.indentLevel, 0, 'should be at top level after struct closes');
        assert.strictEqual(ctx.inStruct, false, 'closed struct must not count as open');
    });

    it('keeps an unclosed (truncated) block open at the boundary', () => {
        const content = 'struct A {\n  1: i32 x\n';
        // boundary = 1 (inside an unclosed struct body): still inside struct
        const ctx = computeFormattingContext(content, 1, 'truncated-open-1');
        assert.strictEqual(ctx.inStruct, true, 'unclosed struct should remain open');
        assert.strictEqual(ctx.indentLevel, 1, 'indent level inside unclosed struct');
    });

    it('treats a single-line block as closed after its own line', () => {
        const content = 'struct A {}\nstruct B {\n  1: i32 x\n}\n';
        const lines = content.split('\n');
        // boundary = 0 (struct A's own line): the single-line block is already closed,
        // so a range starting on the next line must be at top level, not inside struct A
        const ctx = computeFormattingContext(lines.slice(0, 1).join('\n'), 0, 'single-line-closed-1');
        assert.strictEqual(ctx.inStruct, false, 'single-line block must not count as open');
        assert.strictEqual(ctx.indentLevel, 0, 'should be at top level after single-line block');
    });
});
