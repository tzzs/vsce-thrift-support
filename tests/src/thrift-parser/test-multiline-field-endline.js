require('../../require-hook.js');
const assert = require('assert');

let ThriftParser;
before(() => {
    ({ThriftParser} = require('../../../out/ast/parser.js'));
});

function run() {
    // 测试 1: 多行数组字段的 range 应跨越所有行
    const src1 = `struct Test {
  1: list<string> items = [
    "a",
    "b"
  ]
}`;
    const doc1 = new ThriftParser(src1).parse();
    const struct1 = doc1.children.find(c => c.type === 'Struct');
    assert.ok(struct1, 'Should find struct');
    const field1 = struct1.fields[0];
    assert.ok(field1, 'Should find field');
    assert.strictEqual(field1.range.start.line, 1, 'Field range should start at line 1');
    assert.ok(field1.range.end.line >= 3,
        `Multi-line field range should span multiple lines, got end.line=${field1.range.end.line}`);

    // 测试 2: 多行 map 字段
    const src2 = `struct Test {
  2: map<string,i32> data = {
    "a": 1,
    "b": 2
  }
}`;
    const doc2 = new ThriftParser(src2).parse();
    const struct2 = doc2.children[0];
    const field2 = struct2.fields[0];
    assert.ok(field2, 'Should find field');
    assert.ok(field2.range.end.line > field2.range.start.line,
        `Map field range should span multiple lines, start=${field2.range.start.line} end=${field2.range.end.line}`);

    // 测试 3: 单行字段 range 保持单行
    const src3 = `struct Test {
  3: string name = "hello"
}`;
    const doc3 = new ThriftParser(src3).parse();
    const struct3 = doc3.children[0];
    const field3 = struct3.fields[0];
    assert.ok(field3, 'Should find field');
    assert.strictEqual(field3.range.start.line, field3.range.end.line,
        `Single-line field should have equal start/end lines, got start=${field3.range.start.line} end=${field3.range.end.line}`);

    // 测试 4: 多行带注解字段 — range 应包含注解行
    const src4 = `struct Test {
  4: list<i32> nums = [
    1,
    2
  ] (desc="numbers")
}`;
    const doc4 = new ThriftParser(src4).parse();
    const struct4 = doc4.children[0];
    const field4 = struct4.fields[0];
    assert.ok(field4, 'Should find field');
    assert.ok(field4.range.end.line >= 4,
        `Field with annotation range should include closing line, got end.line=${field4.range.end.line}`);

    // 测试 5: 多行字符串续接字段
    const src5 = String.raw`struct Test {
  5: string msg = "Hello \
World"
}`;
    const doc5 = new ThriftParser(src5).parse();
    const struct5 = doc5.children[0];
    const field5 = struct5.fields[0];
    assert.ok(field5, 'Should find field');
    assert.ok(field5.range.end.line > field5.range.start.line,
        `String-continuation field should span multiple lines, start=${field5.range.start.line} end=${field5.range.end.line}`);

    // 测试 6: 带逗号结尾的多行字段
    const src6 = `struct Test {
  6: set<string> tags = {
    "a",
    "b"
  },
}`;
    const doc6 = new ThriftParser(src6).parse();
    const struct6 = doc6.children[0];
    const field6 = struct6.fields[0];
    assert.ok(field6, 'Should find field');
    assert.ok(field6.range.end.line > field6.range.start.line,
        'Field with trailing comma should span multiple lines');
}

describe('multiline-field-endline (parser)', () => {
    it('should compute correct end line for multi-line struct fields', () => {
        run();
    });
});
