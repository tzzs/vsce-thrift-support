const assert = require('assert');
const {ThriftParser} = require('../../../../out/ast/parser.js');

describe('nested-generics', () => {
    it('parses nested generic field type without truncation', () => {
        // 旧 fallback regex `[a-zA-Z0-9_<>.,]+` 在嵌套泛型的内层逗号处截断，
        // 主路径通过 angleDepth 跟踪正确捕获完整类型。
        const content = [
            'struct Container {',
            '  1: map<string, list<i32>> mymap',
            '}'
        ].join('\n');

        const ast = new ThriftParser(content).parse();
        const container = ast.body.find(node => node.type === 'Struct' && node.name === 'Container');
        assert.ok(container, 'Container struct should be parsed');
        assert.strictEqual(container.fields.length, 1);
        const field = container.fields[0];
        assert.strictEqual(field.name, 'mymap');
        assert.strictEqual(field.fieldType, 'map<string, list<i32>>',
            `nested generic should be intact, got: ${JSON.stringify(field.fieldType)}`);
    });

    it('parses nested generic return type in service method', () => {
        // service 方法的 returnType 同样必须正确处理嵌套泛型。
        const content = [
            'service DataAccess {',
            '  map<string, list<MyType>> fetch(1: i32 id)',
            '}'
        ].join('\n');

        const ast = new ThriftParser(content).parse();
        const service = ast.body.find(node => node.type === 'Service' && node.name === 'DataAccess');
        assert.ok(service, 'DataAccess service should be parsed');
        assert.strictEqual(service.functions.length, 1);
        const func = service.functions[0];
        assert.strictEqual(func.name, 'fetch');
        assert.strictEqual(func.returnType, 'map<string, list<MyType>>',
            `nested generic return type should be intact, got: ${JSON.stringify(func.returnType)}`);
    });

    it('regression: regular fields still parse correctly after fallback removal', () => {
        // 验证移除 fallback 后主路径覆盖常规字段，避免回归。
        const content = [
            'struct User {',
            '  1: required i32 id,',
            '  2: optional string name,',
            '  3: list<string> tags',
            '}'
        ].join('\n');

        const ast = new ThriftParser(content).parse();
        const user = ast.body.find(node => node.type === 'Struct' && node.name === 'User');
        assert.ok(user, 'User struct should be parsed');
        assert.strictEqual(user.fields.length, 3);

        assert.strictEqual(user.fields[0].name, 'id');
        assert.strictEqual(user.fields[0].fieldType, 'i32');
        assert.strictEqual(user.fields[0].requiredness, 'required');

        assert.strictEqual(user.fields[1].name, 'name');
        assert.strictEqual(user.fields[1].fieldType, 'string');
        assert.strictEqual(user.fields[1].requiredness, 'optional');

        assert.strictEqual(user.fields[2].name, 'tags');
        assert.strictEqual(user.fields[2].fieldType, 'list<string>');
    });
});
