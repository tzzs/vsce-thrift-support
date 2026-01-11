const assert = require('assert');
const {ThriftParser} = require('../../../../out/ast/parser.js');

describe('parsing-fix', () => {
    it('should pass all test assertions', () => {
        const thriftContent = `
    namespace java com.example
    
    struct User {
        1: required string name
        2: optional i32 age
    }
    
    service UserService {
        User getUser(1: i32 id)
    }
    `;

        const parser = new ThriftParser(thriftContent);
        const ast = parser.parse();

        assert.strictEqual(ast.body.length, 3, 'Should parse 3 nodes (namespace, struct, service)');
        assert.strictEqual(ast.body[0].type, 'Namespace');
        assert.strictEqual(ast.body[1].type, 'Struct');
        assert.strictEqual(ast.body[2].type, 'Service');
    });
});