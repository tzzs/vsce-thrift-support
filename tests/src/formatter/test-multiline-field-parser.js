const assert = require('assert');

const {
    buildStructFieldFromAst
} = require('../../../out/formatter/field-parser.js');

function run() {
    // 模拟 AST 节点模板
    function makeFieldNode(id, name, fieldType, startLine = 3, endLine = 5) {
        return {
            id,
            requiredness: undefined,
            fieldType,
            name,
            range: { start: { line: startLine }, end: { line: endLine } }
        };
    }

    // 测试 1: 多行数组默认值带首行行内注释
    const fieldWithComment = buildStructFieldFromAst(
        '1: list<string> items = [  // inline comment\n  "a",\n  "b"\n]',
        makeFieldNode('1', 'items', 'list<string>')
    );
    assert.ok(fieldWithComment, 'Expected field parse for multi-line with comment');
    assert.ok(fieldWithComment.comment.includes('inline comment'),
        `Comment should be extracted, got: "${fieldWithComment.comment}"`);

    // 测试 2: 多行 map 默认值不带注释
    const fieldNoComment = buildStructFieldFromAst(
        '1: map<string,i32> data = {\n  "a": 1\n}',
        makeFieldNode('2', 'data', 'map<string,i32>')
    );
    assert.ok(fieldNoComment, 'Expected field parse for multi-line map');
    assert.strictEqual(fieldNoComment.comment, '');

    // 测试 3: 多行字符串续接
    const fieldString = buildStructFieldFromAst(
        '3: string msg = "Hello \\\nWorld"',
        makeFieldNode('3', 'msg', 'string')
    );
    assert.ok(fieldString, 'Expected field parse for multi-line string');
    assert.ok(fieldString.suffix.includes('Hello'), 'Suffix should contain string start');

    // 测试 4: 注解在最后一行
    const fieldWithAnnotation = buildStructFieldFromAst(
        '1: list<i32> nums = [\n  1,\n  2\n] (desc="numbers")',
        makeFieldNode('4', 'nums', 'list<i32>')
    );
    assert.ok(fieldWithAnnotation, 'Expected field parse for multi-line with annotation');
    assert.strictEqual(fieldWithAnnotation.annotation, '(desc="numbers")',
        'Should extract annotation from last line');

    // 测试 5: 尾行带 inline 注释
    const fieldLastComment = buildStructFieldFromAst(
        '1: set<string> tags = {\n  "a"\n} // end comment',
        makeFieldNode('5', 'tags', 'set<string>')
    );
    assert.ok(fieldLastComment, 'Expected field parse for multi-line with trailing comment');
    assert.ok(fieldLastComment.comment.includes('end comment'),
        `Should extract comment from last line, got: "${fieldLastComment.comment}"`);
}

describe('multiline-field-parser', () => {
    it('should parse multi-line struct fields with comments', () => {
        run();
    });
});
