const assert = require('assert');
const {checkSyntax} = require('../../../../out/diagnostics/rules/syntax-check.js');

describe('syntax-check', () => {
    function run(lines) {
        const issues = [];
        checkSyntax(lines, issues);
        return issues;
    }

    it('produces no issues for balanced braces', () => {
        const lines = [
            'struct Foo {',
            '  1: i32 id',
            '}'
        ];
        assert.deepStrictEqual(run(lines), []);
    });

    it('reports unmatched closing brace', () => {
        const lines = ['  1: i32 id }'];
        const issues = run(lines);
        assert.ok(issues.length > 0, 'expected an issue for unmatched }');
        assert.ok(issues.some(i => i.message.includes('Unmatched')));
    });

    it('reports unclosed opening brace', () => {
        const lines = ['struct Foo {', '  1: i32 id'];
        const issues = run(lines);
        assert.ok(issues.length > 0, 'expected an issue for unclosed {');
        assert.ok(issues.some(i => i.message.includes('Unclosed')));
    });

    it('reports mismatched delimiters', () => {
        // Opening { closed by )
        const lines = ['struct Foo {', '  1: i32 id', ')'];
        const issues = run(lines);
        assert.ok(issues.length > 0, 'expected a mismatch issue');
        assert.ok(issues.some(i => i.message.includes('Mismatched') || i.message.includes('Unmatched')));
    });

    it('ignores braces inside double-quoted string literals', () => {
        // The { and } inside the string should not affect the bracket balance.
        const lines = [
            'struct Foo {',
            '  1: string s = "{ not a bracket }",',
            '}'
        ];
        assert.deepStrictEqual(run(lines), []);
    });

    it('ignores braces inside single-quoted string literals', () => {
        const lines = [
            'struct Foo {',
            "  1: string s = '{ not a bracket }',",
            '}'
        ];
        assert.deepStrictEqual(run(lines), []);
    });

    it('handles escaped quotes inside strings without throwing off balance', () => {
        const lines = [
            'struct Foo {',
            '  1: string s = "he said \\"hello\\" {ok}",',
            '}'
        ];
        assert.deepStrictEqual(run(lines), []);
    });

    it('detects unclosed parenthesis', () => {
        const lines = ['service Svc {', '  void foo(1: i32 id'];
        const issues = run(lines);
        assert.ok(issues.some(i => i.message.includes('Unclosed') && i.message.includes('(')),
            `expected unclosed-( issue, got: ${JSON.stringify(issues.map(i => i.message))}`);
    });
});
