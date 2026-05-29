const assert = require('assert');

const {
    resolveMultilineStringDefault
} = require('../../../out/diagnostics/rules/type-utils.js');

function run() {
    // 测试 1: 单行完整字符串 — 不需要解析
    const single = resolveMultilineStringDefault(['"hello"'], 0, '"hello"');
    assert.strictEqual(single, null, 'Single-line complete string should return null');

    // 测试 2: 两行反斜杠续接（双引号）
    const lines2 = [
        '3: string msg = "Hello \\',
        'World"'
    ];
    const result2 = resolveMultilineStringDefault(lines2, 0, '"Hello \\');
    assert.ok(result2 !== null, 'Should resolve multi-line string');
    // 反斜杠续接：续行内容直接拼接（不替换空格）
    assert.ok(result2.includes('World'), `Should contain "World", got "${result2}"`);

    // 测试 3: 三行反斜杠续接
    const lines3 = [
        '"Line1 \\',
        'Line2 \\',
        'Line3"'
    ];
    const result3 = resolveMultilineStringDefault(lines3, 0, '"Line1 \\');
    assert.ok(result3 !== null);
    assert.ok(result3.includes('Line3'), 'Should include last line');

    // 测试 4: 单引号续接
    const singleQuote = resolveMultilineStringDefault(
        ["'Hello \\", "World'"],
        0,
        "'Hello \\"
    );
    assert.ok(singleQuote !== null);
    assert.ok(singleQuote.includes('Hello'), 'Should handle single-quoted strings');

    // 测试 5: 带注解的多行字符串（注解应被 stripAnnotationsForType 移除）
    const withAnnotation = resolveMultilineStringDefault(
        ['"Value \\', 'continued" (annotation)'],
        0,
        '"Value \\'
    );
    assert.ok(withAnnotation !== null);
    assert.ok(!withAnnotation.includes('(annotation)'), 'Annotation should be stripped from resolved value');

    // 测试 6: 已有闭合引号的不应解析
    const alreadyClosed = resolveMultilineStringDefault(
        ['"complete"'],
        0,
        '"complete"'
    );
    assert.strictEqual(alreadyClosed, null, 'Already-closed string should return null');

    // 测试 7: 不以反斜杠结尾的未闭合字符串 — 不可解析
    const noBackslash = resolveMultilineStringDefault(
        ['"incomplete'],
        0,
        '"incomplete'
    );
    assert.strictEqual(noBackslash, null, 'Unclosed non-continuation string should return null');
}

describe('resolveMultilineStringDefault', () => {
    it('should resolve multi-line string defaults', () => {
        run();
    });
});
