const assert = require('assert');
const {ThriftParser} = require('../../../../out/ast/parser.js');

describe('member-declarations', () => {
    it('should pass all test assertions', () => {
        const content = [
            'struct User {',
            '  1: required string name,',
            '  2: optional list<i32> ids = [1, 2] (anno="x")',
            '}',
            '',
            'enum Status {',
            '  OK = 1,',
            '  FAIL',
            '}',
            '',
            'service S {',
            '  oneway void ping(1: i32 id; 2: string name) throws (1: Error err; 2: Other other)',
            '}'
        ].join('\n');

        const parser = new ThriftParser(content);
        const ast = parser.parse();

        const structNode = ast.body.find(n => n.type === 'Struct');
        const enumNode = ast.body.find(n => n.type === 'Enum');
        const serviceNode = ast.body.find(n => n.type === 'Service');

        const fieldOne = structNode?.fields?.[0];
        const fieldTwo = structNode?.fields?.[1];

        assert.strictEqual(fieldOne?.id, 1);
        assert.strictEqual(fieldOne?.requiredness, 'required');
        assert.strictEqual(fieldOne?.fieldType, 'string');
        assert.strictEqual(fieldOne?.name, 'name');

        assert.strictEqual(fieldTwo?.id, 2);
        assert.strictEqual(fieldTwo?.requiredness, 'optional');
        assert.strictEqual(fieldTwo?.fieldType, 'list<i32>');
        assert.strictEqual(fieldTwo?.name, 'ids');
        assert.strictEqual(fieldTwo?.defaultValue, '[1, 2]');

        const enumOk = enumNode?.members?.[0];
        const enumFail = enumNode?.members?.[1];

        assert.strictEqual(enumOk?.name, 'OK');
        assert.strictEqual(enumOk?.initializer, '1');
        assert.strictEqual(enumFail?.name, 'FAIL');
        assert.strictEqual(enumFail?.initializer, undefined);

        const func = serviceNode?.functions?.[0];
        assert.strictEqual(func?.name, 'ping');
        assert.strictEqual(func?.returnType, 'void');
        assert.strictEqual(func?.oneway, true);
        assert.strictEqual(func?.arguments?.length, 2);
        assert.strictEqual(func?.arguments?.[1]?.fieldType, 'string');
        assert.strictEqual(func?.arguments?.[1]?.name, 'name');
        assert.strictEqual(func?.throws?.length, 2);
        assert.strictEqual(func?.throws?.[1]?.fieldType, 'Other');
        assert.strictEqual(func?.throws?.[1]?.name, 'other');
    });
});
