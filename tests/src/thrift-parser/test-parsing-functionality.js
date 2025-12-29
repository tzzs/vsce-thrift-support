// Unit test for parsing functionality based on debug-parsing.js

const assert = require('assert');
const Module = require('module');

// Mock VSCode API
const {createVscodeMock, installVscodeMock} = require('../../mock_vscode.js');
const vscode = createVscodeMock({
    workspace: {
        getConfiguration: () => ({
            get: (key, defaultValue) => {
                const configs = {
                    'trailingComma': 'preserve',
                    'alignTypes': true,
                    'alignFieldNames': false,
                    'alignComments': true,
                    'indentSize': 4,
                    'maxLineLength': 100
                };
                return configs[key] !== undefined ? configs[key] : defaultValue;
            }
        })
    }
});
installVscodeMock(vscode);


// Mock require for vscode module
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
    if (request === 'vscode') {
        return vscode;
    }
    return originalLoad.apply(this, arguments);
};

async function run() {
    console.log('\nRunning parsing functionality tests...');

    let ThriftParser;
    try {
        ({ThriftParser} = require('../../../out/ast/parser.js'));
    } catch (error) {
        throw new Error(`Failed to load AST parser: ${error.message}`);
    }

    console.log('Testing AST parser struct fields...');

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

    const ast = new ThriftParser(content).parse();
    const structNode = ast.body.find(node => node.type === 'Struct' && node.name === 'User');
    assert.ok(structNode, 'Should parse struct User');
    const fields = structNode.fields;
    assert.strictEqual(fields.length, 5, 'Should parse 5 struct fields');

    const fieldChecks = [
        { id: 1, requiredness: 'required', type: 'list<string>', name: 'names', hasDefault: false },
        { id: 2, requiredness: 'optional', type: 'map<string,i32>', name: 'values', hasDefault: false },
        { id: 3, requiredness: undefined, type: 'i32', name: 'count', hasDefault: false },
        { id: 4, requiredness: 'required', type: 'string', name: 'name', hasDefault: true },
        { id: 5, requiredness: 'optional', type: 'bool', name: 'isActive', hasDefault: true }
    ];

    fieldChecks.forEach((expected, idx) => {
        const field = fields[idx];
        assert.strictEqual(field.id, expected.id, `Field ID should be ${expected.id}`);
        assert.strictEqual(field.requiredness, expected.requiredness, `Requiredness should be ${expected.requiredness}`);
        assert.strictEqual(normalizeType(field.fieldType), expected.type, `Type should be "${expected.type}"`);
        assert.strictEqual(field.name, expected.name, `Name should be "${expected.name}"`);
        assert.strictEqual(!!field.defaultValue, expected.hasDefault, `hasDefault should be ${expected.hasDefault}`);
    });

    console.log('All AST parsing tests passed! ✅');
}

run().catch(err => {
    console.error(err);
    process.exit(1);
}).finally(() => {
    // Restore original require
    Module._load = originalLoad;
});
