const assert = require('assert');
const path = require('path');
const vscode = require('vscode');

const {
    ThriftCallHierarchyProvider,
    extractTypeReferences,
    forEachServiceMethod,
    findFunctionAtPosition,
    buildServiceIndex,
    buildTypeIndex,
    collectTransitiveChildren
} = require('../../../out/call-hierarchy-provider.js');

const {ThriftParser} = require('../../../packages/core/out/ast/parser.js');

function createDoc(text, fsPath = '/tmp/t.thrift', version = 1) {
    return {
        uri: {
            fsPath,
            scheme: 'file',
            path: fsPath,
            toString: () => `file://${fsPath}?v=${version}`
        },
        version,
        getText: () => text,
        lineAt: (line) => ({text: text.split('\n')[line] || ''})
    };
}

function setWorkspaceDocs(files) {
    // files: [{path, text}]
    const docs = files.map(f => createDoc(f.text, f.path));
    vscode.workspace.textDocuments = docs;
    vscode.workspace.findFiles = async () => docs.map(d => d.uri);
    return docs;
}

describe('call-hierarchy-provider', () => {
    afterEach(() => {
        vscode.workspace.textDocuments = [];
        vscode.workspace.findFiles = async () => [];
    });

    it('extractTypeReferences strips primitives and containers, keeps user types', () => {
        assert.deepStrictEqual(extractTypeReferences('i32'), []);
        assert.deepStrictEqual(extractTypeReferences('string'), []);
        assert.deepStrictEqual(extractTypeReferences('User'), ['User']);
        const refs = extractTypeReferences('list<User>');
        assert.deepStrictEqual(refs, ['User']);
        const nested = extractTypeReferences('map<string, User>');
        assert.deepStrictEqual(nested, ['User']);
        const dotted = extractTypeReferences('shared.User');
        assert.deepStrictEqual(dotted, ['User']);
    });

    it('forEachServiceMethod visits all methods in services and interactions', () => {
        const text = [
            'service S {',
            '  void foo()',
            '  void bar()',
            '}',
            'interaction I {',
            '  void baz()',
            '}'
        ].join('\n');
        const ast = new ThriftParser(text).parse();
        const seen = [];
        forEachServiceMethod(ast, {fsPath: '/x.thrift'}, e => seen.push(e.serviceName + '.' + e.methodName));
        assert.deepStrictEqual(seen.sort(), ['I.baz', 'S.bar', 'S.foo']);
    });

    it('findFunctionAtPosition locates a method within a service', () => {
        const text = [
            'service Greeter {',
            '  string hello(',
            '    1: string name',
            '  )',
            '}'
        ].join('\n');
        const ast = new ThriftParser(text).parse();
        // line 1 is "  string hello(" — search position over the `hello` identifier
        const hit = findFunctionAtPosition(ast, 1, 10);
        assert.ok(hit, 'expected to find function at position');
        assert.strictEqual(hit.func.name, 'hello');
        assert.strictEqual(hit.service.name, 'Greeter');
    });

    it('findFunctionAtPosition returns null when outside any function', () => {
        const text = 'service Greeter {\n}\n';
        const ast = new ThriftParser(text).parse();
        const hit = findFunctionAtPosition(ast, 1, 0);
        assert.strictEqual(hit, null);
    });

    it('buildServiceIndex captures extends relationships', () => {
        const text = [
            'service Base {',
            '  void hi()',
            '}',
            'service Child extends Base {',
            '  void hi()',
            '}'
        ].join('\n');
        const ast = new ThriftParser(text).parse();
        const idx = buildServiceIndex([{uri: {fsPath: '/x.thrift'}, ast}]);
        assert.ok(idx.has('Base'));
        assert.ok(idx.has('Child'));
        assert.strictEqual(idx.get('Child').extendsName, 'Base');
    });

    it('collectTransitiveChildren walks extends chain', () => {
        const text = [
            'service A {',
            '  void f()',
            '}',
            'service B extends A {',
            '  void f()',
            '}',
            'service C extends B {',
            '  void f()',
            '}'
        ].join('\n');
        const ast = new ThriftParser(text).parse();
        const idx = buildServiceIndex([{uri: {fsPath: '/x.thrift'}, ast}]);
        const children = collectTransitiveChildren(idx, 'A');
        const names = children.map(c => c.serviceName).sort();
        assert.deepStrictEqual(names, ['B', 'C']);
    });

    it('buildTypeIndex registers struct/union/enum/exception/typedef', () => {
        const text = [
            'struct S {\n  1: i32 a\n}',
            'union U {\n  1: i32 a\n}',
            'exception E {\n  1: i32 a\n}',
            'enum K {\n  X\n}',
            'typedef i32 MyInt'
        ].join('\n');
        const ast = new ThriftParser(text).parse();
        const idx = buildTypeIndex([{uri: {fsPath: '/x.thrift'}, ast}]);
        assert.ok(idx.has('S'));
        assert.ok(idx.has('U'));
        assert.ok(idx.has('E'));
        assert.ok(idx.has('K'));
        assert.ok(idx.has('MyInt'));
    });

    it('prepareCallHierarchy returns a CallHierarchyItem on a method definition', async () => {
        const text = [
            'service Greeter {',
            '  string hello(',
            '    1: string name',
            '  )',
            '}'
        ].join('\n');
        const doc = createDoc(text, '/g.thrift');
        const provider = new ThriftCallHierarchyProvider();
        const item = await provider.prepareCallHierarchy(doc, {line: 1, character: 10}, {isCancellationRequested: false});
        assert.ok(item, 'expected CallHierarchyItem');
        assert.strictEqual(item.name, 'hello');
        assert.ok(item.detail.includes('Greeter'));
    });

    it('prepareCallHierarchy returns undefined when not on a method', async () => {
        const text = 'struct S {\n  1: i32 id\n}\n';
        const doc = createDoc(text, '/s.thrift');
        const provider = new ThriftCallHierarchyProvider();
        const item = await provider.prepareCallHierarchy(doc, {line: 0, character: 0}, {isCancellationRequested: false});
        assert.strictEqual(item, undefined);
    });

    it('provideCallHierarchyIncomingCalls finds overrides in child services', async () => {
        const text = [
            'service Base {',
            '  void hi()',
            '}',
            'service Child extends Base {',
            '  void hi()',
            '}'
        ].join('\n');
        const doc = createDoc(text, '/g.thrift');
        setWorkspaceDocs([{path: '/g.thrift', text}]);
        const provider = new ThriftCallHierarchyProvider();
        const item = await provider.prepareCallHierarchy(doc, {line: 1, character: 7}, {isCancellationRequested: false});
        assert.ok(item, 'expected prepare to succeed');
        const incoming = await provider.provideCallHierarchyIncomingCalls(item, {isCancellationRequested: false});
        assert.strictEqual(incoming.length, 1, 'expected one incoming call from Child');
        assert.strictEqual(incoming[0].from.name, 'hi');
        assert.ok(incoming[0].from.detail.includes('Child'));
    });

    it('provideCallHierarchyOutgoingCalls finds parent override + referenced types', async () => {
        const text = [
            'struct UserInfo {',
            '  1: string name',
            '}',
            'service Base {',
            '  void foo(',
            '    1: UserInfo info',
            '  )',
            '}',
            'service Child extends Base {',
            '  void foo(',
            '    1: UserInfo info',
            '  )',
            '}'
        ].join('\n');
        const doc = createDoc(text, '/g.thrift');
        setWorkspaceDocs([{path: '/g.thrift', text}]);
        const provider = new ThriftCallHierarchyProvider();
        // Find Child.foo position (line should be 9 — "  void foo(")
        const item = await provider.prepareCallHierarchy(doc, {line: 9, character: 8}, {isCancellationRequested: false});
        assert.ok(item, 'expected prepare to find Child.foo');
        assert.ok(item.detail.includes('Child'), 'expected item to be Child.foo, got ' + item.detail);
        const outgoing = await provider.provideCallHierarchyOutgoingCalls(item, {isCancellationRequested: false});
        const names = outgoing.map(o => o.to.name).sort();
        assert.ok(names.includes('foo'), 'expected parent foo as outgoing call: ' + JSON.stringify(names));
        assert.ok(names.includes('UserInfo'), 'expected UserInfo type as outgoing call: ' + JSON.stringify(names));
    });

    it('returns empty incoming/outgoing for cancellation', async () => {
        const provider = new ThriftCallHierarchyProvider();
        const fakeItem = {name: 'x', detail: 'service S', uri: {fsPath: '/x.thrift'}, selectionRange: {start: {line: 0, character: 0}, end: {line: 0, character: 1}}};
        const inc = await provider.provideCallHierarchyIncomingCalls(fakeItem, {isCancellationRequested: true});
        const out = await provider.provideCallHierarchyOutgoingCalls(fakeItem, {isCancellationRequested: true});
        assert.deepStrictEqual(inc, []);
        assert.deepStrictEqual(out, []);
    });
});
