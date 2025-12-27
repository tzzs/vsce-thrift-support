// Unit test for parsing functionality based on debug-parsing.js

const assert = require('assert');
const Module = require('module');

// Mock VSCode API
const {createVscodeMock, installVscodeMock} = require('../../test-helpers/vscode-mock');
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

    let parser;
    try {
        const {ThriftParser} = require('../../../out/src/thriftParser.js');
        parser = new ThriftParser();
    } catch (error) {
        throw new Error(`Failed to load thrift parser: ${error.message}`);
    }

    console.log('Testing isStructField function...');
    
    // Test valid struct fields
    const validFields = [
        '1: required list<string> names,',
        '2: optional map<string, i32> values,',
        '3: i32 count',
        '4: required string name = "default"',
        '5: optional bool isActive = true'
    ];

    validFields.forEach(field => {
        const result = parser.isStructField(field);
        assert.strictEqual(result, true, `Should identify as struct field: "${field}"`);
    });
    console.log(`✓ Validated ${validFields.length} valid struct fields`);

    // Test invalid struct fields
    const invalidIsStructFields = [
        'struct User {',
        '}',
        'service UserService {',
        'const i32 MAX_VALUE = 100',
        'enum Status {',
        'ACTIVE = 1'
    ];

    invalidIsStructFields.forEach(field => {
        const result = parser.isStructField(field);
        assert.strictEqual(result, false, `Should not identify as struct field: "${field}"`);
    });
    console.log(`✓ Validated ${invalidIsStructFields.length} invalid struct fields`);

    console.log('Testing parseStructField function...');
    
    // Test parsing valid struct fields
    const fieldTests = [
        {
            field: '1: required list<string> names,',
            expected: { fieldId: 1, requiredness: 'required', type: 'list<string>', name: 'names', hasDefault: false }
        },
        {
            field: '2: optional map<string, i32> values,',
            expected: { fieldId: 2, requiredness: 'optional', type: 'map<string,i32>', name: 'values', hasDefault: false }
        },
        {
            field: '3: i32 count',
            expected: { fieldId: 3, requiredness: '', type: 'i32', name: 'count', hasDefault: false }
        },
        {
            field: '4: required string name = "default"',
            expected: { fieldId: 4, requiredness: 'required', type: 'string', name: 'name', hasDefault: true }
        },
        {
            field: '5: optional bool isActive = true',
            expected: { fieldId: 5, requiredness: 'optional', type: 'bool', name: 'isActive', hasDefault: true }
        }
    ];

    fieldTests.forEach(({ field, expected }) => {
        const result = parser.parseStructField(field);
        assert.notStrictEqual(result, null, `Should parse struct field: "${field}"`);
        assert.strictEqual(result.id, expected.fieldId.toString(), `Field ID should be ${expected.fieldId}`);
        assert.strictEqual(result.qualifier, expected.requiredness, `Requiredness should be ${expected.requiredness}`);
        assert.strictEqual(result.type, expected.type, `Type should be "${expected.type}"`);
        assert.strictEqual(result.name, expected.name, `Name should be "${expected.name}"`);
        assert.strictEqual(!!result.suffix && result.suffix.includes('='), expected.hasDefault, `hasDefault should be ${expected.hasDefault}`);
    });
    console.log(`✓ Parsed ${fieldTests.length} struct fields successfully`);

    // Test parsing invalid struct fields
    const invalidParseFields = [
        'struct User {',
        '}',
        'service UserService {',
        'const i32 MAX_VALUE = 100'
    ];

    invalidParseFields.forEach(field => {
        const result = parser.parseStructField(field);
        assert.strictEqual(result, null, `Should return null for invalid field: "${field}"`);
    });
    console.log(`✓ Validated ${invalidParseFields.length} invalid struct fields`);

    console.log('All parsing functionality tests passed! ✅');
}

run().catch(err => {
    console.error(err);
    process.exit(1);
}).finally(() => {
    // Restore original require
    Module._load = originalLoad;
});