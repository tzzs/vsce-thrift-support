const assert = require('assert');
const vscode = require('vscode');

const {
    ThriftTypeHierarchyProvider,
    buildTypeHierarchyIndex,
    findTypeAtPosition,
    registerTypeHierarchyProvider
} = require('../../../out/type-hierarchy-provider.js');

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
    const docs = files.map(f => createDoc(f.text, f.path));
    vscode.workspace.textDocuments = docs;
    vscode.workspace.findFiles = async () => docs.map(d => d.uri);
    return docs;
}

describe('type-hierarchy-provider', () => {
    afterEach(() => {
        vscode.workspace.textDocuments = [];
        vscode.workspace.findFiles = async () => [];
    });

    it('buildTypeHierarchyIndex links service to parent via extends', () => {
        const text = [
            'service Base {',
            '  void f()',
            '}',
            'service Child extends Base {',
            '  void f()',
            '}'
        ].join('\n');
        const ast = new ThriftParser(text).parse();
        const idx = buildTypeHierarchyIndex([{uri: {fsPath: '/x.thrift'}, ast}]);
        assert.ok(idx.has('Base'));
        assert.ok(idx.has('Child'));
        assert.strictEqual(idx.get('Child').parentName, 'Base');
        assert.strictEqual(idx.get('Base').parentName, undefined);
    });

    it('buildTypeHierarchyIndex links typedef to base type', () => {
        const text = [
            'struct User {\n  1: i32 id\n}',
            'typedef User UserAlias'
        ].join('\n');
        const ast = new ThriftParser(text).parse();
        const idx = buildTypeHierarchyIndex([{uri: {fsPath: '/x.thrift'}, ast}]);
        assert.strictEqual(idx.get('UserAlias').parentName, 'User');
        assert.strictEqual(idx.get('User').parentName, undefined);
    });

    it('typedef referring to a container type has no parent', () => {
        const text = 'typedef list<i32> Numbers';
        const ast = new ThriftParser(text).parse();
        const idx = buildTypeHierarchyIndex([{uri: {fsPath: '/x.thrift'}, ast}]);
        assert.strictEqual(idx.get('Numbers').parentName, undefined);
    });

    it('findTypeAtPosition locates struct/service/enum nodes', () => {
        const text = [
            'struct User {',
            '  1: i32 id',
            '}',
            'enum Color {',
            '  RED',
            '}',
            'service S {',
            '  void f()',
            '}'
        ].join('\n');
        const ast = new ThriftParser(text).parse();
        const userHit = findTypeAtPosition(ast, 0, 8);
        const colorHit = findTypeAtPosition(ast, 3, 6);
        const serviceHit = findTypeAtPosition(ast, 6, 9);
        assert.ok(userHit && userHit.name === 'User', 'expected to find User');
        assert.ok(colorHit && colorHit.name === 'Color', 'expected to find Color');
        assert.ok(serviceHit && serviceHit.name === 'S', 'expected to find S');
    });

    it('prepareTypeHierarchy returns item for struct under cursor', async () => {
        const text = 'struct User {\n  1: i32 id\n}';
        const doc = createDoc(text, '/u.thrift');
        const provider = new ThriftTypeHierarchyProvider();
        const item = await provider.prepareTypeHierarchy(doc, {line: 0, character: 8}, {isCancellationRequested: false});
        assert.ok(item, 'expected item');
        assert.strictEqual(item.name, 'User');
        assert.strictEqual(item.kind, vscode.SymbolKind.Struct);
    });

    it('provideTypeHierarchySupertypes returns parent service', async () => {
        const text = [
            'service Base {',
            '  void f()',
            '}',
            'service Child extends Base {',
            '  void f()',
            '}'
        ].join('\n');
        const doc = createDoc(text, '/g.thrift');
        setWorkspaceDocs([{path: '/g.thrift', text}]);
        const provider = new ThriftTypeHierarchyProvider();
        const item = await provider.prepareTypeHierarchy(doc, {line: 3, character: 10}, {isCancellationRequested: false});
        assert.ok(item, 'expected Child item');
        assert.strictEqual(item.name, 'Child');
        const supers = await provider.provideTypeHierarchySupertypes(item, {isCancellationRequested: false});
        assert.strictEqual(supers.length, 1);
        assert.strictEqual(supers[0].name, 'Base');
    });

    it('provideTypeHierarchySubtypes returns direct child services', async () => {
        const text = [
            'service Base {',
            '  void f()',
            '}',
            'service ChildA extends Base {',
            '  void f()',
            '}',
            'service ChildB extends Base {',
            '  void f()',
            '}'
        ].join('\n');
        const doc = createDoc(text, '/g.thrift');
        setWorkspaceDocs([{path: '/g.thrift', text}]);
        const provider = new ThriftTypeHierarchyProvider();
        const baseItem = await provider.prepareTypeHierarchy(doc, {line: 0, character: 9}, {isCancellationRequested: false});
        assert.ok(baseItem, 'expected Base item');
        const subs = await provider.provideTypeHierarchySubtypes(baseItem, {isCancellationRequested: false});
        const names = subs.map(s => s.name).sort();
        assert.deepStrictEqual(names, ['ChildA', 'ChildB']);
    });

    it('Supertypes empty when no extends', async () => {
        const text = 'service Solo {\n  void f()\n}';
        const doc = createDoc(text, '/g.thrift');
        setWorkspaceDocs([{path: '/g.thrift', text}]);
        const provider = new ThriftTypeHierarchyProvider();
        const item = await provider.prepareTypeHierarchy(doc, {line: 0, character: 9}, {isCancellationRequested: false});
        const supers = await provider.provideTypeHierarchySupertypes(item, {isCancellationRequested: false});
        assert.deepStrictEqual(supers, []);
    });

    it('typedef supertype is the aliased type', async () => {
        const text = [
            'struct User {\n  1: i32 id\n}',
            'typedef User UAlias'
        ].join('\n');
        const doc = createDoc(text, '/u.thrift');
        setWorkspaceDocs([{path: '/u.thrift', text}]);
        const provider = new ThriftTypeHierarchyProvider();
        const item = await provider.prepareTypeHierarchy(doc, {line: 3, character: 14}, {isCancellationRequested: false});
        assert.ok(item, 'expected typedef item');
        assert.strictEqual(item.name, 'UAlias');
        const supers = await provider.provideTypeHierarchySupertypes(item, {isCancellationRequested: false});
        assert.strictEqual(supers.length, 1);
        assert.strictEqual(supers[0].name, 'User');
    });

    it('buildTypeHierarchyIndex registers union with SymbolKind.Struct', () => {
        const text = 'union MyUnion {\n  1: string a,\n  2: i32 b\n}';
        const ast = new ThriftParser(text).parse();
        const idx = buildTypeHierarchyIndex([{uri: {fsPath: '/x.thrift'}, ast}]);
        assert.ok(idx.has('MyUnion'));
        const entry = idx.get('MyUnion');
        assert.strictEqual(entry.kind, vscode.SymbolKind.Struct);
        assert.strictEqual(entry.detail, 'union MyUnion');
        assert.strictEqual(entry.parentName, undefined);
    });

    it('buildTypeHierarchyIndex registers exception with SymbolKind.Class', () => {
        const text = 'exception MyError {\n  1: string msg\n}';
        const ast = new ThriftParser(text).parse();
        const idx = buildTypeHierarchyIndex([{uri: {fsPath: '/x.thrift'}, ast}]);
        assert.ok(idx.has('MyError'));
        const entry = idx.get('MyError');
        assert.strictEqual(entry.kind, vscode.SymbolKind.Class);
        assert.strictEqual(entry.detail, 'exception MyError');
    });

    it('buildTypeHierarchyIndex registers interaction with SymbolKind.Interface', () => {
        const text = 'interaction MyInteraction {\n  void onEvent()\n}';
        const ast = new ThriftParser(text).parse();
        const idx = buildTypeHierarchyIndex([{uri: {fsPath: '/x.thrift'}, ast}]);
        assert.ok(idx.has('MyInteraction'));
        const entry = idx.get('MyInteraction');
        assert.strictEqual(entry.kind, vscode.SymbolKind.Interface);
        assert.strictEqual(entry.detail, 'interaction MyInteraction');
    });

    it('prepareTypeHierarchy returns item for union', async () => {
        const text = 'union Result {\n  1: string val\n}';
        const doc = createDoc(text, '/u.thrift');
        setWorkspaceDocs([{path: '/u.thrift', text}]);
        const provider = new ThriftTypeHierarchyProvider();
        const item = await provider.prepareTypeHierarchy(doc, {line: 0, character: 7}, {isCancellationRequested: false});
        assert.ok(item, 'expected union item');
        assert.strictEqual(item.name, 'Result');
        assert.strictEqual(item.kind, vscode.SymbolKind.Struct);
    });

    it('prepareTypeHierarchy returns item for exception', async () => {
        const text = 'exception Fail {\n  1: i32 code\n}';
        const doc = createDoc(text, '/e.thrift');
        setWorkspaceDocs([{path: '/e.thrift', text}]);
        const provider = new ThriftTypeHierarchyProvider();
        const item = await provider.prepareTypeHierarchy(doc, {line: 0, character: 11}, {isCancellationRequested: false});
        assert.ok(item, 'expected exception item');
        assert.strictEqual(item.name, 'Fail');
        assert.strictEqual(item.kind, vscode.SymbolKind.Class);
    });

    it('prepareTypeHierarchy returns item for interaction', async () => {
        const text = 'interaction Inter {\n  void f()\n}';
        const doc = createDoc(text, '/i.thrift');
        setWorkspaceDocs([{path: '/i.thrift', text}]);
        const provider = new ThriftTypeHierarchyProvider();
        const item = await provider.prepareTypeHierarchy(doc, {line: 0, character: 13}, {isCancellationRequested: false});
        assert.ok(item, 'expected interaction item');
        assert.strictEqual(item.name, 'Inter');
        assert.strictEqual(item.kind, vscode.SymbolKind.Interface);
    });

    it('respects cancellation token', async () => {
        const text = 'service S {\n  void f()\n}';
        const doc = createDoc(text);
        setWorkspaceDocs([{path: '/x.thrift', text}]);
        const provider = new ThriftTypeHierarchyProvider();
        const item = await provider.prepareTypeHierarchy(doc, {line: 0, character: 9}, {isCancellationRequested: true});
        assert.strictEqual(item, undefined);
        const fakeItem = {name: 'X', detail: 'service X', uri: doc.uri, range: {start: {line: 0, character: 0}, end: {line: 0, character: 0}}, selectionRange: {start: {line: 0, character: 0}, end: {line: 0, character: 0}}};
        const supers = await provider.provideTypeHierarchySupertypes(fakeItem, {isCancellationRequested: true});
        const subs = await provider.provideTypeHierarchySubtypes(fakeItem, {isCancellationRequested: true});
        assert.deepStrictEqual(supers, []);
        assert.deepStrictEqual(subs, []);
    });

    it('registerTypeHierarchyProvider registers provider and returns it', () => {
        const context = { subscriptions: [] };
        const provider = registerTypeHierarchyProvider(context);
        assert.ok(provider instanceof ThriftTypeHierarchyProvider, 'Should return a ThriftTypeHierarchyProvider');
        assert.strictEqual(context.subscriptions.length, 1, 'Should push one disposable to subscriptions');
    });
});
