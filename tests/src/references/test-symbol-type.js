const assert = require('assert');
const vscode = require('vscode');

const nodesModule = require('../../../out/ast/nodes.types.js');
const ThriftNodeType = nodesModule.ThriftNodeType;

const {getSymbolType} = require('../../../out/references/symbol-type.js');

function makeRange(startLine, startChar, endLine, endChar) {
    return {start: {line: startLine, character: startChar}, end: {line: endLine, character: endChar}};
}

function createDoc(text, extra) {
    const lines = text.split('\n');
    return Object.assign({
        getText: () => text,
        lineAt: (i) => ({text: lines[i] || ''}),
        lineCount: lines.length,
        getWordRangeAtPosition: () => null
    }, extra);
}

function createPosition(line, character) {
    return {line, character};
}

// Build AST nodes for testing
function makeDocument(body) {
    return {
        type: ThriftNodeType.Document,
        range: makeRange(0, 0, 99, 0),
        body: body
    };
}

function makeStructNode(name, fields, line) {
    return {
        type: ThriftNodeType.Struct,
        name: name,
        range: makeRange(line, 0, line + 1 + (fields ? fields.length : 0), 1),
        fields: fields || []
    };
}

function makeFieldNode(name, fieldType, line) {
    return {
        type: ThriftNodeType.Field,
        name: name,
        fieldType: fieldType,
        range: makeRange(line, 4, line, 30)
    };
}

function makeSimpleNode(type, name, line) {
    return {
        type: type,
        name: name,
        range: makeRange(line, 0, line, 30)
    };
}

describe('symbol-type', () => {
    describe('dot-separated names', () => {
        it('should return type for symbolName containing dot', () => {
            const doc = createDoc('');
            const result = getSymbolType(doc, createPosition(0, 0), 'com.example.MyType', {
                getCachedAst: () => makeDocument([])
            });
            assert.strictEqual(result, 'type');
        });
    });

    describe('namespace detection', () => {
        it('should detect namespace pattern (word followed by .word)', () => {
            const doc = createDoc('namespace java com.example', {
                getWordRangeAtPosition: (pos, regex) => {
                    // Simulate cursor on ExampleService
                    return {start: {line: 2, character: 49}, end: {line: 2, character: 63}};
                }
            });
            // Simulate a scenario where after the word there's a .OtherType pattern
            // We test this by providing a doc whose lineAt returns appropriate text
            const doc2 = createDoc('const com.example.MyType myVar = ...', {
                getWordRangeAtPosition: (pos, regex) => {
                    return {start: {line: 0, character: 6}, end: {line: 0, character: 22}};
                }
            });
            const result = getSymbolType(doc2, createPosition(0, 6), 'com.example.MyType', {
                getCachedAst: () => makeDocument([])
            });
            assert.strictEqual(result, 'type');
        });
    });

    describe('node name matches symbolName', () => {
        it('struct node -> struct', () => {
            const node = makeStructNode('MyStruct', [], 0);
            const doc = createDoc('');
            const result = getSymbolType(doc, createPosition(0, 5), 'MyStruct', {
                getCachedAst: () => makeDocument([node])
            });
            assert.strictEqual(result, 'struct');
        });

        it('union node -> union', () => {
            const node = makeSimpleNode(ThriftNodeType.Union, 'MyUnion', 0);
            const doc = createDoc('');
            const result = getSymbolType(doc, createPosition(0, 5), 'MyUnion', {
                getCachedAst: () => makeDocument([node])
            });
            assert.strictEqual(result, 'union');
        });

        it('exception node -> exception', () => {
            const node = makeSimpleNode(ThriftNodeType.Exception, 'MyException', 0);
            const doc = createDoc('');
            const result = getSymbolType(doc, createPosition(0, 5), 'MyException', {
                getCachedAst: () => makeDocument([node])
            });
            assert.strictEqual(result, 'exception');
        });

        it('enum node -> enum', () => {
            const node = makeSimpleNode(ThriftNodeType.Enum, 'MyEnum', 0);
            const doc = createDoc('');
            const result = getSymbolType(doc, createPosition(0, 5), 'MyEnum', {
                getCachedAst: () => makeDocument([node])
            });
            assert.strictEqual(result, 'enum');
        });

        it('service node -> service', () => {
            const node = makeSimpleNode(ThriftNodeType.Service, 'MyService', 0);
            const doc = createDoc('');
            const result = getSymbolType(doc, createPosition(0, 5), 'MyService', {
                getCachedAst: () => makeDocument([node])
            });
            assert.strictEqual(result, 'service');
        });

        it('interaction node -> interaction', () => {
            const node = makeSimpleNode(ThriftNodeType.Interaction, 'MyInteraction', 0);
            const doc = createDoc('');
            const result = getSymbolType(doc, createPosition(0, 5), 'MyInteraction', {
                getCachedAst: () => makeDocument([node])
            });
            assert.strictEqual(result, 'interaction');
        });

        it('performs node -> interaction', () => {
            const node = makeSimpleNode(ThriftNodeType.Performs, 'MyPerforms', 0);
            const doc = createDoc('');
            const result = getSymbolType(doc, createPosition(0, 5), 'MyPerforms', {
                getCachedAst: () => makeDocument([node])
            });
            assert.strictEqual(result, 'interaction');
        });

        it('typedef node -> typedef', () => {
            const node = makeSimpleNode(ThriftNodeType.Typedef, 'MyType', 0);
            const doc = createDoc('');
            const result = getSymbolType(doc, createPosition(0, 5), 'MyType', {
                getCachedAst: () => makeDocument([node])
            });
            assert.strictEqual(result, 'typedef');
        });

        it('const node -> type', () => {
            const node = makeSimpleNode(ThriftNodeType.Const, 'MY_CONST', 0);
            const doc = createDoc('');
            const result = getSymbolType(doc, createPosition(0, 5), 'MY_CONST', {
                getCachedAst: () => makeDocument([node])
            });
            assert.strictEqual(result, 'type');
        });

        it('field node -> field', () => {
            const node = makeFieldNode('myField', 'string', 0);
            const doc = createDoc('');
            const result = getSymbolType(doc, createPosition(0, 10), 'myField', {
                getCachedAst: () => makeDocument([node])
            });
            assert.strictEqual(result, 'field');
        });

        it('function node -> method', () => {
            const node = makeSimpleNode(ThriftNodeType.Function, 'myMethod', 0);
            const doc = createDoc('');
            const result = getSymbolType(doc, createPosition(0, 5), 'myMethod', {
                getCachedAst: () => makeDocument([node])
            });
            assert.strictEqual(result, 'method');
        });

        it('enumMember node -> enumValue', () => {
            const node = makeSimpleNode(ThriftNodeType.EnumMember, 'VALUE_A', 0);
            const doc = createDoc('');
            const result = getSymbolType(doc, createPosition(0, 5), 'VALUE_A', {
                getCachedAst: () => makeDocument([node])
            });
            assert.strictEqual(result, 'enumValue');
        });
    });

    describe('node name does NOT match symbolName - children search', () => {
        it('struct field by name -> field', () => {
            const field = makeFieldNode('myField', 'string', 1);
            const struct = makeStructNode('MyStruct', [field], 0);
            // Position inside the struct, but symbolName is the field name
            const doc = createDoc('');
            const result = getSymbolType(doc, createPosition(0, 5), 'myField', {
                getCachedAst: () => makeDocument([struct])
            });
            assert.strictEqual(result, 'field');
        });

        it('struct field by type -> type', () => {
            const field = makeFieldNode('myField', 'MyCustomType', 1);
            const struct = makeStructNode('MyStruct', [field], 0);
            const doc = createDoc('');
            const result = getSymbolType(doc, createPosition(0, 5), 'MyCustomType', {
                getCachedAst: () => makeDocument([struct])
            });
            assert.strictEqual(result, 'type');
        });

        it('struct field by dotted type -> type', () => {
            const field = makeFieldNode('myField', 'com.example.MyType', 1);
            const struct = makeStructNode('MyStruct', [field], 0);
            const doc = createDoc('');
            const result = getSymbolType(doc, createPosition(0, 5), 'MyType', {
                getCachedAst: () => makeDocument([struct])
            });
            assert.strictEqual(result, 'type');
        });

        it('enum member by name -> enumValue', () => {
            const member = makeSimpleNode(ThriftNodeType.EnumMember, 'RED', 1);
            const enumNode = {
                type: ThriftNodeType.Enum,
                name: 'Color',
                range: makeRange(0, 0, 3, 1),
                members: [member]
            };
            const doc = createDoc('');
            const result = getSymbolType(doc, createPosition(0, 5), 'RED', {
                getCachedAst: () => makeDocument([enumNode])
            });
            assert.strictEqual(result, 'enumValue');
        });

        it('service method by name -> method', () => {
            const method = makeSimpleNode(ThriftNodeType.Function, 'getUser', 1);
            method.returnType = 'User';
            const service = {
                type: ThriftNodeType.Service,
                name: 'MyService',
                range: makeRange(0, 0, 3, 1),
                functions: [method]
            };
            const doc = createDoc('');
            const result = getSymbolType(doc, createPosition(0, 5), 'getUser', {
                getCachedAst: () => makeDocument([service])
            });
            assert.strictEqual(result, 'method');
        });

        it('no match returns null', () => {
            const node = makeStructNode('MyStruct', [], 0);
            const doc = createDoc('');
            const result = getSymbolType(doc, createPosition(0, 5), 'NonExistent', {
                getCachedAst: () => makeDocument([node])
            });
            assert.strictEqual(result, null);
        });
    });
});
