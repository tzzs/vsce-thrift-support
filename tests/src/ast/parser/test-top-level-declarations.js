const assert = require('assert');
const {ThriftParser} = require('../../../../out/ast/parser.js');

function sliceByRange(lines, range) {
    if (!range) return null;
    if (range.start.line === range.end.line) {
        return lines[range.start.line].slice(range.start.character, range.end.character);
    }
    return null;
}

describe('top-level-declarations', () => {
    it('should pass all test assertions', () => {
        const content = [
            'namespace java com.example',
            'include "shared.thrift"',
            'cpp_include "gen-cpp/custom.h"',
            'typedef map<string, i32> StringMap',
            'typedef map cpp_type "std::unordered_map"<string, i32> NativeStringMap',
            'const i32 MAX = 3',
            'enum Status {',
            '  OK = 1',
            '}',
            'struct User {',
            '}',
            'service Child extends base.Parent {',
            '}'
        ].join('\n');

        const lines = content.split('\n');
        const parser = new ThriftParser(content);
        const ast = parser.parse();

        const namespaceNode = ast.body.find(n => n.type === 'Namespace');
        const includeNode = ast.body.find(n => n.type === 'Include');
        const cppIncludeNode = ast.body.find(n => n.type === 'Include' && n.path === 'gen-cpp/custom.h');
        const typedefNode = ast.body.find(n => n.type === 'Typedef' && n.name === 'StringMap');
        const nativeTypedefNode = ast.body.find(n => n.type === 'Typedef' && n.name === 'NativeStringMap');
        const constNode = ast.body.find(n => n.type === 'Const');
        const enumNode = ast.body.find(n => n.type === 'Enum');
        const structNode = ast.body.find(n => n.type === 'Struct');
        const serviceNode = ast.body.find(n => n.type === 'Service');

        assert.strictEqual(namespaceNode?.namespace, 'com.example');
        assert.strictEqual(namespaceNode?.scope, 'java');
        assert.strictEqual(sliceByRange(lines, namespaceNode?.nameRange), 'com.example');

        assert.strictEqual(includeNode?.path, 'shared.thrift');
        assert.strictEqual(includeNode?.includeKind, 'include');
        assert.strictEqual(cppIncludeNode?.path, 'gen-cpp/custom.h');
        assert.strictEqual(cppIncludeNode?.includeKind, 'cpp_include');
        assert.strictEqual(typedefNode?.name, 'StringMap');
        assert.strictEqual(typedefNode?.aliasType, 'map<string, i32>');
        assert.strictEqual(nativeTypedefNode?.aliasType, 'map cpp_type "std::unordered_map"<string, i32>');
        assert.strictEqual(constNode?.name, 'MAX');
        assert.strictEqual(constNode?.valueType, 'i32');

        assert.strictEqual(enumNode?.name, 'Status');
        assert.strictEqual(structNode?.name, 'User');
        assert.strictEqual(serviceNode?.name, 'Child');
        assert.strictEqual(serviceNode?.extends, 'base.Parent');
    });
});
