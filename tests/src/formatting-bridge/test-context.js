const assert = require('assert');
const vscode = require('vscode');

const nodesModule = require('../../../out/ast/nodes.types.js');
const ThriftNodeType = nodesModule.ThriftNodeType;

// Import computeInitialContext and the ThriftParser
const contextModule = require('../../../out/formatting-bridge/context.js');
const computeInitialContext = contextModule.computeInitialContext;

const parserModule = require('../../../out/ast/parser.js');
const ThriftParser = parserModule.ThriftParser;

function makeRange(startLine, startChar, endLine, endChar) {
    return new vscode.Range(startLine, startChar, endLine, endChar);
}

function createDoc(text, overrides) {
    const lines = text.split('\n');
    return Object.assign({
        uri: {toString: () => 'file:///test/test.thrift'},
        getText: (range) => {
            if (range) {
                // Return text from start to the given position
                const upToLine = text.split('\n').slice(0, range.end.line + 1);
                const lastLine = upToLine[upToLine.length - 1];
                upToLine[upToLine.length - 1] = lastLine.substring(0, range.end.character);
                return upToLine.join('\n');
            }
            return text;
        },
        lineAt: (i) => ({text: lines[i] || ''}),
        lineCount: lines.length
    }, overrides);
}

describe('formatting-context', () => {
    // Mock 静态方法必须按分组隔离：describe 级 after 恢复太晚，
    // 会把上一个分组的 mock 泄漏给后续分组（computeFormattingContext
    // 内部经 parseContentWithCache 真实解析，mock 残留会导致误判）。
    describe('inline parse path (useCachedAst=false)', () => {
        let originalParseContentWithCache;

        beforeEach(() => {
            originalParseContentWithCache = ThriftParser.parseContentWithCache;
        });

        afterEach(() => {
            ThriftParser.parseContentWithCache = originalParseContentWithCache;
        });

        it('should return default context for empty before text', () => {
            ThriftParser.parseContentWithCache = () => ({body: []});

            const doc = createDoc('');
            const result = computeInitialContext(doc, new vscode.Position(0, 0), false);
            assert.deepStrictEqual(result, {
                indentLevel: 0,
                inStruct: false,
                inEnum: false,
                inService: false,
                inInteraction: false
            });
        });

        it('should use fallback heuristic when AST has no valid ranges', () => {
            // Return AST with nodes that have no valid ranges
            ThriftParser.parseContentWithCache = () => ({
                body: [{type: ThriftNodeType.Document, range: null, body: []}]
            });

            // Text with a struct that has no closing brace before cursor
            const text = 'struct Foo {\n  1: i32 id\n';
            const doc = createDoc(text);
            const result = computeInitialContext(doc, new vscode.Position(1, 11), false);
            // struct Foo { pushes indentLevel to 1, no closing brace
            assert.strictEqual(result.indentLevel, 1);
            assert.strictEqual(result.inStruct, true);
        });
    });

    describe('cached AST path (useCachedAst=true)', () => {
        let originalParseWithCache;

        beforeEach(() => {
            originalParseWithCache = ThriftParser.parseWithCache;
        });

        afterEach(() => {
            ThriftParser.parseWithCache = originalParseWithCache;
        });

        it('should detect struct from AST', () => {
            const astNode = {
                type: ThriftNodeType.Struct,
                name: 'Foo',
                range: makeRange(0, 0, 2, 1),
                fields: []
            };
            ThriftParser.parseWithCache = () => ({
                type: ThriftNodeType.Document,
                range: makeRange(0, 0, 2, 1),
                body: [astNode]
            });

            const doc = createDoc('struct Foo {\n  1: i32 id\n}\n');
            const result = computeInitialContext(doc, new vscode.Position(1, 0), true);

            assert.strictEqual(result.indentLevel, 1);
            assert.strictEqual(result.inStruct, true);
            assert.strictEqual(result.inEnum, false);
            assert.strictEqual(result.inService, false);
        });

        it('should detect enum from AST', () => {
            const astNode = {
                type: ThriftNodeType.Enum,
                name: 'Color',
                range: makeRange(0, 0, 2, 1),
                members: []
            };
            ThriftParser.parseWithCache = () => ({
                type: ThriftNodeType.Document,
                range: makeRange(0, 0, 2, 1),
                body: [astNode]
            });

            const doc = createDoc('enum Color {\n  RED = 1\n}\n');
            const result = computeInitialContext(doc, new vscode.Position(1, 0), true);

            assert.strictEqual(result.indentLevel, 1);
            assert.strictEqual(result.inEnum, true);
        });

        it('should detect service from AST', () => {
            const astNode = {
                type: ThriftNodeType.Service,
                name: 'MyService',
                range: makeRange(0, 0, 2, 1),
                functions: []
            };
            ThriftParser.parseWithCache = () => ({
                type: ThriftNodeType.Document,
                range: makeRange(0, 0, 2, 1),
                body: [astNode]
            });

            const doc = createDoc('service MyService {\n  void ping()\n}\n');
            const result = computeInitialContext(doc, new vscode.Position(1, 0), true);

            assert.strictEqual(result.indentLevel, 1);
            assert.strictEqual(result.inService, true);
        });

        it('should detect interaction from AST', () => {
            const astNode = {
                type: ThriftNodeType.Interaction,
                name: 'MyInteraction',
                range: makeRange(0, 0, 2, 1),
                functions: []
            };
            ThriftParser.parseWithCache = () => ({
                type: ThriftNodeType.Document,
                range: makeRange(0, 0, 2, 1),
                body: [astNode]
            });

            const doc = createDoc('interaction MyInteraction {\n  void run()\n}\n');
            const result = computeInitialContext(doc, new vscode.Position(1, 0), true);

            assert.strictEqual(result.indentLevel, 1);
            assert.strictEqual(result.inInteraction, true);
        });

        it('should adjust boundaryLine when start.character === 0', () => {
            const astNode = {
                type: ThriftNodeType.Struct,
                name: 'Foo',
                range: makeRange(0, 0, 2, 1),
                fields: []
            };
            ThriftParser.parseWithCache = () => ({
                type: ThriftNodeType.Document,
                range: makeRange(0, 0, 3, 1),
                body: [astNode]
            });

            const doc = createDoc('struct Foo {\n  1: i32 id\n}\n');
            // Position at line 3 (after closing brace), char 0
            // boundaryLine becomes 2, struct Foo is at lines 0-2, still inside
            const result = computeInitialContext(doc, new vscode.Position(3, 0), true);

            // boundaryLine=2, struct=lines 0-2, so indentLevel should be 1
            assert.strictEqual(result.indentLevel, 1);
            assert.strictEqual(result.inStruct, true);
        });
    });

    describe('fallback heuristic (no valid AST ranges)', () => {
        let originalParseContentWithCache;

        beforeEach(() => {
            originalParseContentWithCache = ThriftParser.parseContentWithCache;
        });

        afterEach(() => {
            ThriftParser.parseContentWithCache = originalParseContentWithCache;
        });

        it('should detect struct keyword and brace', () => {
            const text = 'struct Foo {\n  1: i32 id\n';
            ThriftParser.parseContentWithCache = () => ({
                body: [{type: ThriftNodeType.Document, range: null, body: []}]
            });

            const doc = createDoc(text);
            const result = computeInitialContext(doc, new vscode.Position(1, 11), false);

            assert.strictEqual(result.indentLevel, 1);
            assert.strictEqual(result.inStruct, true);
        });

        it('should detect enum keyword and brace', () => {
            const text = 'enum Color {\n  RED = 1\n';
            ThriftParser.parseContentWithCache = () => ({
                body: [{type: ThriftNodeType.Document, range: null, body: []}]
            });

            const doc = createDoc(text);
            const result = computeInitialContext(doc, new vscode.Position(1, 9), false);

            assert.strictEqual(result.indentLevel, 1);
            assert.strictEqual(result.inEnum, true);
        });

        it('should detect service keyword and brace', () => {
            const text = 'service MyService {\n  void ping()\n';
            ThriftParser.parseContentWithCache = () => ({
                body: [{type: ThriftNodeType.Document, range: null, body: []}]
            });

            const doc = createDoc(text);
            const result = computeInitialContext(doc, new vscode.Position(1, 13), false);

            assert.strictEqual(result.indentLevel, 1);
            assert.strictEqual(result.inService, true);
        });

        it('should detect interaction keyword and brace', () => {
            const text = 'interaction MyInteraction {\n  void run()\n';
            ThriftParser.parseContentWithCache = () => ({
                body: [{type: ThriftNodeType.Document, range: null, body: []}]
            });

            const doc = createDoc(text);
            const result = computeInitialContext(doc, new vscode.Position(1, 13), false);

            assert.strictEqual(result.indentLevel, 1);
            assert.strictEqual(result.inInteraction, true);
        });

        it('should handle nested braces for correct indent level', () => {
            const text = 'struct Outer {\n  struct Inner {\n    1: i32 id\n  }\n  1: i32 x\n';
            ThriftParser.parseContentWithCache = () => ({
                body: [{type: ThriftNodeType.Document, range: null, body: []}]
            });

            const doc = createDoc(text);
            // Position inside Outer but after Inner's closing brace
            const result = computeInitialContext(doc, new vscode.Position(4, 10), false);

            assert.strictEqual(result.indentLevel, 1);
            assert.strictEqual(result.inStruct, true);
        });
    });

    describe('error handling', () => {
        let originalParseContentWithCache;

        beforeEach(() => {
            originalParseContentWithCache = ThriftParser.parseContentWithCache;
        });

        afterEach(() => {
            ThriftParser.parseContentWithCache = originalParseContentWithCache;
        });

        it('should return default context when parser throws', () => {
            ThriftParser.parseContentWithCache = () => {
                throw new Error('Parse error');
            };

            const doc = createDoc('invalid');
            const result = computeInitialContext(doc, new vscode.Position(0, 0), false);

            assert.deepStrictEqual(result, {
                indentLevel: 0,
                inStruct: false,
                inEnum: false,
                inService: false,
                inInteraction: false
            });
        });
    });
});
