const assert = require('assert');
const vscode = require('vscode');
const ThriftNodeType = require('../../../out/ast/nodes.types.js').ThriftNodeType;
const {getSymbolType} = require('../../../out/references/symbol-type.js');

function makeRange(startLine, startChar, endLine, endChar) {
    return {start: {line: startLine, character: startChar}, end: {line: endLine, character: endChar}};
}

function createDoc(text, overrides = {}) {
    const lines = text.split('\n');
    return {
        getText: () => text,
        lineAt: (i) => ({text: lines[i] || ''}),
        lineCount: lines.length,
        getWordRangeAtPosition: () => null,
        ...overrides
    };
}

describe('symbol-type advanced', () => {
    describe('dot-separated names', () => {
        it('should return type for symbolName containing dot', () => {
            const result = getSymbolType(createDoc(''), new vscode.Position(0, 0), 'shared.User', {
                getCachedAst: () => ({type: ThriftNodeType.Document, body: []})
            });
            assert.strictEqual(result, 'type');
        });
    });

    describe('namespace detection via word context', () => {
        it('should detect namespace after word (e.g. Type.field)', () => {
            const doc = createDoc('1: NsType.field field', {
                getWordRangeAtPosition: (pos, regex) => ({
                    start: new vscode.Position(0, 3),
                    end: new vscode.Position(0, 9)
                })
            });
            const result = getSymbolType(doc, new vscode.Position(0, 5), 'NsType', {
                getCachedAst: () => ({type: ThriftNodeType.Document, body: []})
            });
            assert.strictEqual(result, 'namespace');
        });
    });

    describe('node name matches symbolName', () => {
        function testNodeType(type, symbolName, expected) {
            const ast = {
                type: ThriftNodeType.Document,
                body: [{
                    type, name: symbolName,
                    range: makeRange(0, 0, 1, 30),
                    fields: [], members: [], functions: []
                }]
            };
            const result = getSymbolType(createDoc('', {
                getWordRangeAtPosition: (pos, regex) => ({
                    start: new vscode.Position(0, 0),
                    end: new vscode.Position(0, symbolName.length)
                })
            }), new vscode.Position(0, 0), symbolName, {
                getCachedAst: () => ast
            });
            assert.strictEqual(result, expected, `${type} node named ${symbolName} should return ${expected}`);
        }

        it('struct node -> struct', () => testNodeType(ThriftNodeType.Struct, 'Test', 'struct'));
        it('union node -> union', () => testNodeType(ThriftNodeType.Union, 'Test', 'union'));
        it('exception node -> exception', () => testNodeType(ThriftNodeType.Exception, 'Test', 'exception'));
        it('enum node -> enum', () => testNodeType(ThriftNodeType.Enum, 'Test', 'enum'));
        it('service node -> service', () => testNodeType(ThriftNodeType.Service, 'Test', 'service'));
        it('interaction node -> interaction', () => testNodeType(ThriftNodeType.Interaction, 'Test', 'interaction'));
        it('performs node -> interaction', () => testNodeType(ThriftNodeType.Performs, 'Test', 'interaction'));
        it('typedef node -> typedef', () => testNodeType(ThriftNodeType.Typedef, 'Test', 'typedef'));
        it('const node -> type', () => testNodeType(ThriftNodeType.Const, 'Test', 'type'));
        it('enumMember node -> enumValue', () => testNodeType(ThriftNodeType.EnumMember, 'Test', 'enumValue'));
    });

    describe('node name does NOT match - child search Service', () => {
        it('should find service method by name -> method', () => {
            const ast = {
                type: ThriftNodeType.Document,
                body: [{
                    type: ThriftNodeType.Service, name: 'MyService',
                    range: makeRange(0, 0, 5, 1),
                    functions: [{
                        type: ThriftNodeType.Function, name: 'getUser',
                        range: makeRange(1, 4, 1, 30), returnType: 'User',
                        arguments: [], throws: []
                    }]
                }]
            };
            const result = getSymbolType(createDoc(''), new vscode.Position(1, 8), 'getUser', {
                getCachedAst: () => ast
            });
            assert.strictEqual(result, 'method');
        });

        it('should find service method return type -> type', () => {
            const ast = {
                type: ThriftNodeType.Document,
                body: [{
                    type: ThriftNodeType.Service, name: 'MyService',
                    range: makeRange(0, 0, 5, 1),
                    functions: [{
                        type: ThriftNodeType.Function, name: 'getUser',
                        range: makeRange(1, 4, 1, 30), returnType: 'User',
                        arguments: [], throws: []
                    }]
                }]
            };
            const result = getSymbolType(createDoc(''), new vscode.Position(1, 8), 'User', {
                getCachedAst: () => ast
            });
            assert.strictEqual(result, 'type');
        });

        it('should find service method namespaced return type -> type', () => {
            const ast = {
                type: ThriftNodeType.Document,
                body: [{
                    type: ThriftNodeType.Service, name: 'MyService',
                    range: makeRange(0, 0, 5, 1),
                    functions: [{
                        type: ThriftNodeType.Function, name: 'getUser',
                        range: makeRange(1, 4, 1, 30), returnType: 'shared.User',
                        arguments: [], throws: []
                    }]
                }]
            };
            const result = getSymbolType(createDoc(''), new vscode.Position(1, 8), 'User', {
                getCachedAst: () => ast
            });
            assert.strictEqual(result, 'type');
        });
    });

    describe('node name does NOT match - child search Interaction', () => {
        it('should find interaction method by name -> method', () => {
            const ast = {
                type: ThriftNodeType.Document,
                body: [{
                    type: ThriftNodeType.Interaction, name: 'MyInteraction',
                    range: makeRange(0, 0, 5, 1),
                    functions: [{
                        type: ThriftNodeType.Function, name: 'execute',
                        range: makeRange(1, 4, 1, 30), returnType: 'void',
                        arguments: [], throws: []
                    }]
                }]
            };
            const result = getSymbolType(createDoc(''), new vscode.Position(1, 8), 'execute', {
                getCachedAst: () => ast
            });
            assert.strictEqual(result, 'method');
        });

        it('should find interaction method return type -> type', () => {
            const ast = {
                type: ThriftNodeType.Document,
                body: [{
                    type: ThriftNodeType.Interaction, name: 'MyInteraction',
                    range: makeRange(0, 0, 5, 1),
                    functions: [{
                        type: ThriftNodeType.Function, name: 'execute',
                        range: makeRange(1, 4, 1, 30), returnType: 'Result',
                        arguments: [], throws: []
                    }]
                }]
            };
            const result = getSymbolType(createDoc(''), new vscode.Position(1, 8), 'Result', {
                getCachedAst: () => ast
            });
            assert.strictEqual(result, 'type');
        });
    });

    describe('node name does NOT match - child search Function', () => {
        it('should find return type on function node -> type', () => {
            const ast = {
                type: ThriftNodeType.Document,
                body: [{
                    type: ThriftNodeType.Struct, name: 'Container',
                    range: makeRange(0, 0, 10, 1),
                    fields: [{
                        type: ThriftNodeType.Function, name: 'callback',
                        range: makeRange(1, 4, 1, 30), returnType: 'Response',
                        arguments: [], throws: []
                    }]
                }]
            };
            const result = getSymbolType(createDoc(''), new vscode.Position(1, 8), 'Response', {
                getCachedAst: () => ast
            });
            assert.strictEqual(result, 'type');
        });
    });

    describe('edge cases', () => {
        it('should return null when node is unknown type', () => {
            const ast = {
                type: ThriftNodeType.Document,
                body: [{
                    type: 'UnknownType', name: 'Test',
                    range: makeRange(0, 0, 1, 30),
                    fields: [], members: [], functions: []
                }]
            };
            const result = getSymbolType(createDoc('', {
                getWordRangeAtPosition: () => ({start: {line: 0, character: 0}, end: {line: 0, character: 4}})
            }), new vscode.Position(0, 0), 'Test', {
                getCachedAst: () => ast
            });
            assert.strictEqual(result, null);
        });

        it('should return null when no node found at position', () => {
            const ast = {type: ThriftNodeType.Document, body: []};
            const result = getSymbolType(createDoc(''), new vscode.Position(0, 0), 'Nothing', {
                getCachedAst: () => ast
            });
            assert.strictEqual(result, null);
        });
    });
});
