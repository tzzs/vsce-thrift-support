const assert = require('assert');
const {
    getPrimitiveTypes,
    isKnownType,
    resolveNamespacedBase,
    isIntegerLiteral,
    extractDefaultValue,
    isValidDefaultValue
} = require('../../../../out/diagnostics/rules/type-utils.js');

describe('type-utils', () => {
    describe('getPrimitiveTypes()', () => {
        it('should return a set containing all Thrift primitives', () => {
            const primitives = getPrimitiveTypes();
            assert.ok(primitives instanceof Set);
            assert.ok(primitives.has('i32'));
            assert.ok(primitives.has('string'));
            assert.ok(primitives.has('bool'));
            assert.ok(primitives.has('double'));
            assert.ok(primitives.has('binary'));
            assert.ok(primitives.has('uuid'));
            assert.ok(primitives.has('void'));
        });
    });

    describe('isKnownType()', () => {
        const definedTypes = new Set(['MyStruct', 'MyEnum']);
        const includeAliases = new Set(['shared', 'common']);

        it('should return false for empty type name', () => {
            assert.strictEqual(isKnownType('', definedTypes, includeAliases), false);
        });

        it('should recognize primitive types', () => {
            assert.strictEqual(isKnownType('i32', definedTypes, includeAliases), true);
            assert.strictEqual(isKnownType('string', definedTypes, includeAliases), true);
            assert.strictEqual(isKnownType('uuid', definedTypes, includeAliases), true);
            assert.strictEqual(isKnownType('void', definedTypes, includeAliases), true);
        });

        it('should recognize keyword types (interaction, service)', () => {
            assert.strictEqual(isKnownType('interaction', definedTypes, includeAliases), true);
            assert.strictEqual(isKnownType('service', definedTypes, includeAliases), true);
        });

        it('should recognize user-defined types', () => {
            assert.strictEqual(isKnownType('MyStruct', definedTypes, includeAliases), true);
            assert.strictEqual(isKnownType('MyEnum', definedTypes, includeAliases), true);
        });

        it('should recognize namespaced types with valid alias', () => {
            assert.strictEqual(isKnownType('shared.MyStruct', definedTypes, includeAliases), true);
        });

        it('should reject namespaced types with unknown alias', () => {
            assert.strictEqual(isKnownType('unknown.MyStruct', definedTypes, includeAliases), false);
        });

        it('should reject namespaced types with valid alias but unknown base type', () => {
            assert.strictEqual(isKnownType('shared.UnknownType', definedTypes, includeAliases), false);
        });

        it('should recognize namespaced primitive types with valid alias', () => {
            assert.strictEqual(isKnownType('common.i32', new Set(), new Set(['common'])), true);
        });

        it('should recognize container types with known inner types', () => {
            assert.strictEqual(isKnownType('list<i32>', definedTypes, includeAliases), true);
            assert.strictEqual(isKnownType('set<MyStruct>', definedTypes, includeAliases), true);
        });

        it('should reject container types with unknown inner types', () => {
            assert.strictEqual(isKnownType('list<UnknownType>', definedTypes, includeAliases), false);
        });

        it('should recognize map types with known key and value types', () => {
            assert.strictEqual(isKnownType('map<i32, string>', definedTypes, includeAliases), true);
        });

        it('should recognize nested container types', () => {
            assert.strictEqual(isKnownType('list<map<i32, string>>', definedTypes, includeAliases), true);
        });

        it('should recognize parameterized stream/sink/interaction types', () => {
            assert.strictEqual(isKnownType('stream<i32>', definedTypes, includeAliases), true);
            assert.strictEqual(isKnownType('sink<string>', definedTypes, includeAliases), true);
            assert.strictEqual(isKnownType('interaction<MyStruct>', definedTypes, includeAliases), true);
            assert.strictEqual(isKnownType('reference<MyStruct>', definedTypes, includeAliases), true);
        });

        it('should return false for completely unknown type', () => {
            assert.strictEqual(isKnownType('NonExistentType', definedTypes, includeAliases), false);
        });
    });

    describe('resolveNamespacedBase()', () => {
        const includeAliases = new Set(['shared', 'common']);

        it('should return type name as-is when no dot present', () => {
            assert.strictEqual(resolveNamespacedBase('MyStruct', includeAliases), 'MyStruct');
        });

        it('should return base type name for namespaced type with valid alias', () => {
            assert.strictEqual(resolveNamespacedBase('shared.MyStruct', includeAliases), 'MyStruct');
        });

        it('should return null for namespaced type with unknown alias', () => {
            assert.strictEqual(resolveNamespacedBase('unknown.MyStruct', includeAliases), null);
        });

        it('should return null for empty alias part', () => {
            assert.strictEqual(resolveNamespacedBase('.MyStruct', includeAliases), null);
        });

        it('should return last segment for multi-dot names', () => {
            assert.strictEqual(resolveNamespacedBase('a.b.Type', new Set(['a'])), 'Type');
        });
    });

    describe('isIntegerLiteral()', () => {
        it('should recognize positive integers', () => {
            assert.strictEqual(isIntegerLiteral('42'), true);
        });

        it('should recognize negative integers', () => {
            assert.strictEqual(isIntegerLiteral('-42'), true);
        });

        it('should recognize zero', () => {
            assert.strictEqual(isIntegerLiteral('0'), true);
        });

        it('should reject float literals', () => {
            assert.strictEqual(isIntegerLiteral('3.14'), false);
            assert.strictEqual(isIntegerLiteral('-3.14'), false);
        });

        it('should trim whitespace', () => {
            assert.strictEqual(isIntegerLiteral('  42  '), true);
        });
    });

    describe('extractDefaultValue()', () => {
        it('should return null when no equals sign present', () => {
            assert.strictEqual(extractDefaultValue('1: i32 id'), null);
        });

        it('should extract integer default value', () => {
            assert.strictEqual(extractDefaultValue('1: i32 age = 25'), '25');
        });

        it('should extract string default value', () => {
            assert.strictEqual(extractDefaultValue('1: string name = "hello"'), '"hello"');
        });

        it('should extract default value after equals followed by comma', () => {
            assert.strictEqual(extractDefaultValue('1: i32 age = 25,  // comment'), '25');
        });

        it('should extract default value before semicolon', () => {
            assert.strictEqual(extractDefaultValue('1: i32 age = 25;  // comment'), '25');
        });

        it('should handle quoted string with escaped content', () => {
            const result = extractDefaultValue('1: string data = "escaped \\\\" quote"');
            assert.strictEqual(result, '"escaped \\\\" quote"');
        });

        it('should handle single-quoted string default', () => {
            const result = extractDefaultValue("1: string code = 'abc'");
            assert.strictEqual(result, "'abc'");
        });

        it('should handle empty default value', () => {
            assert.strictEqual(extractDefaultValue('1: i32 age = '), '');
        });
    });

    describe('isValidDefaultValue()', () => {
        it('should return true for empty value', () => {
            assert.strictEqual(isValidDefaultValue('i32', ''), true);
        });

        it('should validate integer default for integer types', () => {
            assert.strictEqual(isValidDefaultValue('i32', '42'), true);
            assert.strictEqual(isValidDefaultValue('byte', '127'), true);
        });

        it('should reject non-integer default for integer types', () => {
            assert.strictEqual(isValidDefaultValue('i32', 'hello'), false);
        });

        it('should validate boolean defaults', () => {
            assert.strictEqual(isValidDefaultValue('bool', 'true'), true);
            assert.strictEqual(isValidDefaultValue('bool', 'false'), true);
            assert.strictEqual(isValidDefaultValue('bool', '1'), false);
        });

        it('should validate string defaults', () => {
            assert.strictEqual(isValidDefaultValue('string', '"hello"'), true);
            assert.strictEqual(isValidDefaultValue('string', '42'), false);
        });

        it('should validate uuid defaults', () => {
            assert.strictEqual(isValidDefaultValue('uuid', '"550e8400-e29b-41d4-a716-446655440000"'), true);
            assert.strictEqual(isValidDefaultValue('uuid', '"not-a-uuid"'), false);
        });

        it('should validate double defaults', () => {
            assert.strictEqual(isValidDefaultValue('double', '3.14'), true);
            assert.strictEqual(isValidDefaultValue('double', '42'), true);
            assert.strictEqual(isValidDefaultValue('double', 'hello'), false);
        });

        it('should validate list defaults', () => {
            assert.strictEqual(isValidDefaultValue('list<i32>', '[1, 2, 3]'), true);
        });

        it('should validate set defaults', () => {
            assert.strictEqual(isValidDefaultValue('set<string>', 'anything'), true);
        });

        it('should validate map defaults', () => {
            assert.strictEqual(isValidDefaultValue('map<string, i32>', 'anything'), true);
        });
    });
});
