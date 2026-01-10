const assert = require('assert');
const {ThriftParser} = require('../../../../out/ast/parser.js');

function sliceByRange(lines, range) {
    if (!range) return null;
    if (range.start.line === range.end.line) {
        const line = lines[range.start.line] ?? '';
        return line.slice(range.start.character, range.end.character);
    }
    const parts = [];
    parts.push((lines[range.start.line] ?? '').slice(range.start.character));
    for (let i = range.start.line + 1; i < range.end.line; i++) {
        parts.push(lines[i] ?? '');
    }
    parts.push((lines[range.end.line] ?? '').slice(0, range.end.character));
    return parts.join('\n');
}

describe('value-ranges', () => {
    it('should pass all test assertions', () => {
        const content = [
            'typedef string Name',
            'const map<string, i32> KV = {',
            '  "a": 1,',
            '  "b": 2',
            '}',
            '',
            'enum Status {',
            '  Active = 1,',
            '  Disabled',
            '}',
            '',
            'struct User {',
            '  1: optional string name = "abc"',
            '  2: list<i32> ids = [1, 2]',
            '}'
        ].join('\n');

        const lines = content.split('\n');
        const parser = new ThriftParser(content);
        const ast = parser.parse();

        const constNode = ast.body.find(n => n.type === 'Const');
        const enumNode = ast.body.find(n => n.type === 'Enum');
        const structNode = ast.body.find(n => n.type === 'Struct');

        assert.ok(constNode?.valueRange, 'const 应包含 valueRange');
        const constValue = sliceByRange(lines, constNode.valueRange);
        assert.ok(constValue?.startsWith('{'), 'const 值应以 { 开始');
        assert.ok(constValue?.trim().endsWith('}'), 'const 值应以 } 结束');

        const active = enumNode?.members?.find(m => m.name === 'Active');
        assert.ok(active?.initializerRange, 'enum 成员应包含 initializerRange');
        assert.strictEqual(sliceByRange(lines, active.initializerRange), '1');

        const nameField = structNode?.fields?.find(f => f.name === 'name');
        assert.ok(nameField?.defaultValueRange, '字段应包含 defaultValueRange');
        assert.strictEqual(sliceByRange(lines, nameField.defaultValueRange), '"abc"');

        const idsField = structNode?.fields?.find(f => f.name === 'ids');
        assert.ok(idsField?.defaultValueRange, '字段应包含 defaultValueRange');
        assert.strictEqual(sliceByRange(lines, idsField.defaultValueRange), '[1, 2]');
    });
});