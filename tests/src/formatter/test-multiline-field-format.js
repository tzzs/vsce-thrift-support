const assert = require('assert');

const {
    formatStructFields
} = require('../../../out/formatter/struct-format.js');

// 模拟 deps
const deps = {
    getIndent: (level) => '  '.repeat(level)
};

const defaultOptions = {
    alignTypes: false,
    alignFieldNames: false,
    alignComments: false,
    alignAnnotations: false,
    trailingComma: 'preserve',
    useTabs: false,
    tabWidth: 2
};

// 触发多行格式化路径：需要 alignment 或 trailingComma !== 'preserve'
const multiLineOptions = {
    ...defaultOptions,
    trailingComma: 'remove'
};

function makeMultiLineField(overrides = {}) {
    // 模拟 buildStructFieldFromAst 返回的多行字段
    return {
        line: '',
        id: '1',
        qualifier: '',
        type: 'list<string>',
        name: 'items',
        suffix: ' = [\n  "a",\n  "b"\n]',
        comment: '',
        annotation: '',
        ...overrides
    };
}

function run() {
    // 测试 1: 基本多行数组默认值格式化
    const field1 = makeMultiLineField();
    const result1 = formatStructFields([field1], multiLineOptions, 1, deps);
    assert.ok(Array.isArray(result1), 'Should return array of lines');
    assert.strictEqual(result1.length, 1, 'Multi-line field returns single string (multiline field)');
    const lines1 = result1[0].split('\n');
    assert.ok(lines1.length >= 3, `Should have at least 3 lines, got ${lines1.length}`);
    assert.ok(lines1[0].includes('1:'), 'First line should contain field id');
    assert.ok(lines1[lines1.length - 1].includes(']'), 'Last line should contain closing bracket');

    // 测试 2: 多行字段带注解
    const field2 = makeMultiLineField({ annotation: '(description="test")' });
    const result2 = formatStructFields([field2], multiLineOptions, 1, deps);
    const lines2 = result2[0].split('\n');
    const lastLine2 = lines2[lines2.length - 1];
    assert.ok(lastLine2.includes('(description="test")'),
        `Last line should contain annotation, got: "${lastLine2}"`);

    // 测试 3: 多行字段带 trailing comma (with 'preserve' mode)
    const field3 = makeMultiLineField({ suffix: ' = [\n  "a",\n  "b"\n],' });
    const result3 = formatStructFields([field3], { ...defaultOptions, alignFieldNames: true }, 1, deps);
    const lines3 = result3[0].split('\n');
    assert.ok(lines3[lines3.length - 1].includes(','),
        `Last line should preserve trailing comma, got: "${lines3[lines3.length - 1]}"`);

    // 测试 4: 多行字段中空行过滤 — diff 中增加空行，确保不会输出仅缩进的空行
    const field4 = makeMultiLineField({ suffix: ' = [\n  "a",\n\n  "b"\n]' });
    const result4 = formatStructFields([field4], multiLineOptions, 1, deps);
    const lines4 = result4[0].split('\n');
    // 空的中间行（只有缩进的行）应被过滤
    const indentedEmpty = lines4.filter(l => l.trim() === '' && l.length > 0);
    assert.ok(indentedEmpty.length === 0,
        'Should not produce indented empty lines from blank middleDV');

    // 测试 5: 多行字符串续接
    const field5 = makeMultiLineField({
        type: 'string',
        name: 'msg',
        suffix: ' = "Hello \\\nWorld"'
    });
    const result5 = formatStructFields([field5], multiLineOptions, 1, deps);
    assert.ok(result5[0].includes('msg'), 'Should include field name');
    assert.ok(result5[0].includes('Hello'), 'Should preserve string continuation');

    // 测试 6: 单 entry map（header + 1 entry + closing = 3 lines）
    const field6 = makeMultiLineField({
        type: 'map<string,i32>',
        name: 'data',
        suffix: ' = {\n  "a": 1\n}'
    });
    const result6 = formatStructFields([field6], multiLineOptions, 1, deps);
    const lines6 = result6[0].split('\n');
    assert.strictEqual(lines6.length, 3, 'Map with 1 entry should produce 3 lines (header + entry + closing)');
    assert.ok(lines6[0].includes('= {'), 'First line should include opening brace');
    assert.ok(lines6[2].includes('}'), 'Last line should include closing brace');
}

describe('multiline-field-format', () => {
    it('should format multi-line struct fields correctly', () => {
        run();
    });
});
