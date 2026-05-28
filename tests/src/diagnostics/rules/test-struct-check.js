const assert = require('assert');
const vscode = require('vscode');
const {checkStruct} = require('../../../../out/diagnostics/rules/struct-check.js');

// Minimal helpers to build AST-shaped objects without importing the full parser.
function makeRange(sl, sc, el, ec) {
    return new vscode.Range(sl, sc, el, ec);
}

function makeField(id, fieldType, name, defaultValue, defaultValueRange) {
    return {
        id,
        fieldType,
        name,
        requiredness: undefined,
        range: makeRange(0, 0, 0, 40),
        typeRange: makeRange(0, 4, 0, 10),
        defaultValue,
        defaultValueRange
    };
}

function makeStruct(fields) {
    return {
        type: 'Struct',
        name: 'TestStruct',
        fields,
        range: makeRange(0, 0, 3, 1)
    };
}

describe('struct-check', () => {
    const definedTypes = new Set(['MyStruct', 'MyEnum']);
    const includeAliases = new Set(['shared']);
    const lines = [
        'struct TestStruct {',
        '  1: i32 id,',
        '  2: string name',
        '}'
    ];

    it('produces no issues for a valid struct', () => {
        const struct = makeStruct([
            makeField(1, 'i32', 'id'),
            makeField(2, 'string', 'name')
        ]);
        const issues = [];
        checkStruct(struct, definedTypes, includeAliases, lines, issues);
        assert.deepStrictEqual(issues, []);
    });

    it('reports duplicate field IDs', () => {
        const struct = makeStruct([
            makeField(1, 'i32', 'a'),
            makeField(1, 'string', 'b')   // duplicate id=1
        ]);
        const issues = [];
        checkStruct(struct, definedTypes, includeAliases, lines, issues);
        assert.ok(issues.length > 0, 'expected a duplicate-id issue');
        assert.ok(issues.some(i => i.message.includes('Duplicate') || i.message.includes('1')));
    });

    it('reports unknown field type', () => {
        const struct = makeStruct([
            makeField(1, 'NonExistentType', 'x')
        ]);
        const issues = [];
        checkStruct(struct, definedTypes, includeAliases, lines, issues);
        assert.ok(issues.length > 0, 'expected an unknown-type issue');
        assert.ok(issues.some(i => i.message.includes('NonExistentType')));
    });

    it('accepts user-defined types as known', () => {
        const struct = makeStruct([
            makeField(1, 'MyStruct', 'inner'),
            makeField(2, 'MyEnum', 'kind')
        ]);
        const issues = [];
        checkStruct(struct, definedTypes, includeAliases, lines, issues);
        assert.deepStrictEqual(issues, []);
    });

    it('accepts list<KnownType> as valid', () => {
        const struct = makeStruct([
            makeField(1, 'list<MyStruct>', 'items')
        ]);
        const issues = [];
        checkStruct(struct, definedTypes, includeAliases, lines, issues);
        assert.deepStrictEqual(issues, [],
            'list<KnownType> should produce no unknown-type issue');
    });

    it('reports invalid default value type mismatch', () => {
        // A string literal as default for i32 is a type mismatch.
        const struct = makeStruct([
            makeField(1, 'i32', 'count', '"hello"', makeRange(0, 15, 0, 22))
        ]);
        const issues = [];
        checkStruct(struct, definedTypes, includeAliases, lines, issues);
        assert.ok(issues.some(i => i.message.includes('Invalid default') || i.message.includes('hello') || i.message.includes('type')),
            `expected invalid-default issue, got: ${JSON.stringify(issues.map(i => i.message))}`);
    });
});
