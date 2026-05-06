// Mock vscode
require('../../../require-hook.js');
const {ThriftParser} = require('../../../../out/ast/parser.js');
const assert = require('assert');

const testContent = `
struct SharedStruct {
    1: required string name,
    2: optional i32 value
}
`;

async function run() {

    const parser = new ThriftParser(testContent);
    const ast = parser.parse();

    assert.ok(ast.body, 'AST should have a body');
    assert.ok(ast.body.length > 0, 'AST body should contain at least one item');

    const item = ast.body[0];
    assert.strictEqual(item.name, 'SharedStruct', 'Struct name should be SharedStruct');

}

describe('AST parse string', () => {
    it('should parse Thrift code and build correct AST', async () => {
        await run();
    });
});