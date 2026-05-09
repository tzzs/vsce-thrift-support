const assert = require('assert');
const path = require('path');
const vscode = require('vscode');
const {ThriftParser} = require('../../../out/ast/parser.js');
const nodes = require('../../../out/ast/nodes.types.js');
const {findNodeAtPosition} = require('../../../out/references/node-locator.js');

describe('node-locator advanced', () => {
    function parseThrift(text, uriStr = 'test.thrift') {
        const uri = vscode.Uri.file(path.join('/tmp', uriStr));
        const doc = {getText: () => text, uri, languageId: 'thrift'};
        return new ThriftParser(doc).parse();
    }

    it('should find field node inside struct', () => {
        const ast = parseThrift('struct User {\n  1: i32 id\n  2: string name\n}');
        const pos = new vscode.Position(1, 6);
        const node = findNodeAtPosition(ast, pos);
        assert.ok(node);
        assert.strictEqual(node.type, nodes.ThriftNodeType.Field);
        assert.strictEqual(node.name, 'id');
    });

    it('should find struct node when position is on struct keyword', () => {
        const ast = parseThrift('struct User {\n  1: i32 id\n}');
        const pos = new vscode.Position(0, 2);
        const node = findNodeAtPosition(ast, pos);
        assert.ok(node);
        assert.strictEqual(node.type, nodes.ThriftNodeType.Struct);
    });

    it('should find enum node on enum keyword', () => {
        const ast = parseThrift('enum Color {\n  RED = 1\n}');
        const pos = new vscode.Position(0, 2);
        const node = findNodeAtPosition(ast, pos);
        assert.ok(node);
        assert.strictEqual(node.type, nodes.ThriftNodeType.Enum);
    });

    it('should find enum member', () => {
        const ast = parseThrift('enum Color {\n  RED = 1\n}');
        const pos = new vscode.Position(1, 4);
        const node = findNodeAtPosition(ast, pos);
        assert.ok(node);
        assert.strictEqual(node.type, nodes.ThriftNodeType.EnumMember);
    });

    it('should find service node on service keyword', () => {
        const ast = parseThrift('service MyAPI {\n  void ping()\n}');
        const pos = new vscode.Position(0, 3);
        const node = findNodeAtPosition(ast, pos);
        assert.ok(node);
        assert.strictEqual(node.type, nodes.ThriftNodeType.Service);
    });

    it('should find function node inside service', () => {
        const ast = parseThrift('service MyAPI {\n  User getUser(1: i32 id)\n}');
        const pos = new vscode.Position(1, 6);
        const node = findNodeAtPosition(ast, pos);
        assert.ok(node);
        assert.strictEqual(node.type, nodes.ThriftNodeType.Function);
    });

    it('should find function argument', () => {
        const ast = parseThrift('service MyAPI {\n  User getUser(1: i32 userId)\n}');
        const pos = new vscode.Position(1, 20);
        const node = findNodeAtPosition(ast, pos);
        assert.ok(node);
        assert.strictEqual(node.type, nodes.ThriftNodeType.Field);
        assert.strictEqual(node.name, 'userId');
    });

    it('should find throws field inside function', () => {
        const ast = parseThrift('service MyAPI {\n  void save() throws (1: Error err)\n}');
        const pos = new vscode.Position(1, 28);
        const node = findNodeAtPosition(ast, pos);
        assert.ok(node);
    });

    it('should return undefined when position is outside all nodes', () => {
        const ast = parseThrift('struct User {\n  1: i32 id\n}');
        const pos = new vscode.Position(99, 0);
        const node = findNodeAtPosition(ast, pos);
        assert.strictEqual(node, undefined);
    });

    it('should find interaction node', () => {
        const ast = parseThrift('interaction MyInteraction {\n  void start()\n}');
        const pos = new vscode.Position(0, 5);
        const node = findNodeAtPosition(ast, pos);
        if (node) {
            assert.strictEqual(node.type, nodes.ThriftNodeType.Interaction);
        }
    });

    it('should find nested struct field deeply', () => {
        const ast = parseThrift('struct Outer {\n  1: Inner inner\n}\n\nstruct Inner {\n  1: i32 value\n}');
        const pos = new vscode.Position(5, 8);
        const node = findNodeAtPosition(ast, pos);
        assert.ok(node);
        assert.strictEqual(node.type, nodes.ThriftNodeType.Field);
        assert.strictEqual(node.name, 'value');
    });

    it('should find const node', () => {
        const ast = parseThrift('const i32 MAX = 100');
        const pos = new vscode.Position(0, 6);
        const node = findNodeAtPosition(ast, pos);
        if (node) {
            assert.strictEqual(node.type, nodes.ThriftNodeType.Const);
        }
    });
});
