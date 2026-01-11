const assert = require('assert');
const {ThriftParser} = require('../../../../out/ast/parser.js');

function sliceByRange(lines, range) {
    if (!range) return null;
    if (range.start.line === range.end.line) {
        const line = lines[range.start.line] ?? '';
        return line.slice(range.start.character, range.end.character);
    }
    return null;
}

describe('type-ranges', () => {
    it('should pass all test assertions', () => {
        const content = [
            'typedef map<string, i32> KV',
            'const string CONST_VAL = "x"',
            '',
            'struct User {',
            '  1: required list<i32> ids,',
            '}',
            '',
            'service S {',
            '  User getUser(1: i32 id)',
            '}'
        ].join('\n');

        const lines = content.split('\n');
        const parser = new ThriftParser(content);
        const ast = parser.parse();

        const typedefNode = ast.body.find(n => n.type === 'Typedef');
        const constNode = ast.body.find(n => n.type === 'Const');
        const structNode = ast.body.find(n => n.type === 'Struct');
        const serviceNode = ast.body.find(n => n.type === 'Service');

        assert.ok(typedefNode?.aliasTypeRange, 'typedef 应包含 aliasTypeRange');
        assert.strictEqual(sliceByRange(lines, typedefNode.aliasTypeRange)?.trim(), 'map<string, i32>');

        assert.ok(constNode?.valueTypeRange, 'const 应包含 valueTypeRange');
        assert.strictEqual(sliceByRange(lines, constNode.valueTypeRange)?.trim(), 'string');

        const field = structNode?.fields?.[0];
        assert.ok(field?.typeRange, 'struct 字段应包含 typeRange');
        assert.strictEqual(sliceByRange(lines, field.typeRange)?.trim(), 'list<i32>');

        const func = serviceNode?.functions?.[0];
        assert.ok(func?.returnTypeRange, 'service 函数应包含 returnTypeRange');
        assert.strictEqual(sliceByRange(lines, func.returnTypeRange)?.trim(), 'User');
    });
});