require('../../require-hook.js');
const assert = require('assert');

async function run() {

    let parser;
    try {
        const {ThriftParser} = require('../../../out/ast/parser.js');
        parser = ThriftParser;
    } catch (error) {
        throw new Error(`Failed to load AST parser: ${error.message}`);
    }

    const normalizeType = (type) => type.replace(/\s+</g, '<')
        .replace(/<\s+/g, '<')
        .replace(/\s+>/g, '>')
        .replace(/>\s*/g, '>')
        .replace(/\s*,\s*/g, ',');


    const content = `
struct User {
    1: required list<string> names,
    2: optional map<string, i32> values,
    3: i32 count
    4: required string name = "default"
    5: optional bool isActive = true
}
`;

    const ast = new parser(content).parse();
    const structNode = ast.body.find(node => node.type === 'Struct' && node.name === 'User');
    assert.ok(structNode, 'Should parse struct User');

    const fields = structNode.fields;
    assert.strictEqual(fields.length, 5, 'Should parse 5 struct fields');

    const fieldChecks = [
        {id: 1, requiredness: 'required', type: 'list<string>', name: 'names', hasDefault: false},
        {id: 2, requiredness: 'optional', type: 'map<string,i32>', name: 'values', hasDefault: false},
        {id: 3, requiredness: undefined, type: 'i32', name: 'count', hasDefault: false},
        {id: 4, requiredness: 'required', type: 'string', name: 'name', hasDefault: true},
        {id: 5, requiredness: 'optional', type: 'bool', name: 'isActive', hasDefault: true}
    ];

    fieldChecks.forEach((expected, idx) => {
        const field = fields[idx];
        assert.strictEqual(field.id, expected.id, `Field ID should be ${expected.id}`);
        assert.strictEqual(field.requiredness, expected.requiredness, `Requiredness should be ${expected.requiredness}`);
        assert.strictEqual(normalizeType(field.fieldType), expected.type, `Type should be "${expected.type}"`);
        assert.strictEqual(field.name, expected.name, `Name should be "${expected.name}"`);
        assert.strictEqual(!!field.defaultValue, expected.hasDefault, `hasDefault should be ${expected.hasDefault}`);
    });

}

describe('completion-provider', () => {
    it('should pass parsing functionality tests', async () => {
        await run();
    });
});

if (require.main === module) {
    run().catch(err => {
        console.error(err);
        process.exit(1);
    });
}
