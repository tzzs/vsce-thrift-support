const assert = require('assert');
const vscode = require('vscode');

const {
    ThriftSemanticTokensProvider,
    SEMANTIC_TOKEN_TYPES,
    SEMANTIC_TOKEN_MODIFIERS,
    buildSemanticTokensFromAst,
    buildLegend
} = require('../../../out/semantic-tokens-provider.js');

const {ThriftParser} = require('../../../packages/core/out/ast/parser.js');

function createDoc(text, uri = 'file:///t.thrift', version = 1) {
    return {
        uri: {
            fsPath: uri.replace('file://', ''),
            toString: () => uri
        },
        version,
        getText: () => text,
        lineAt: (line) => ({text: text.split('\n')[line] || ''})
    };
}

function tokensFor(text) {
    const ast = new ThriftParser(text).parse();
    return buildSemanticTokensFromAst(ast);
}

function tokenTypeName(t) {
    return SEMANTIC_TOKEN_TYPES[t.tokenType];
}

function findToken(tokens, predicate) {
    return tokens.find(predicate);
}

describe('semantic-tokens-provider', () => {
    it('legend contains all expected token types and modifiers', () => {
        const legend = buildLegend();
        assert.strictEqual(legend.tokenTypes.length, SEMANTIC_TOKEN_TYPES.length);
        assert.strictEqual(legend.tokenModifiers.length, SEMANTIC_TOKEN_MODIFIERS.length);
        assert.ok(legend.tokenTypes.includes('struct'));
        assert.ok(legend.tokenTypes.includes('enum'));
        assert.ok(legend.tokenTypes.includes('interface'));
        assert.ok(legend.tokenTypes.includes('method'));
        assert.ok(legend.tokenTypes.includes('property'));
        assert.ok(legend.tokenModifiers.includes('declaration'));
        assert.ok(legend.tokenModifiers.includes('readonly'));
    });

    it('emits struct declaration token', () => {
        const tokens = tokensFor('struct User {\n  1: i32 id\n}');
        const userTok = findToken(tokens, t => tokenTypeName(t) === 'struct');
        assert.ok(userTok, 'expected struct token');
        assert.strictEqual(userTok.line, 0);
        assert.strictEqual(userTok.length, 'User'.length);
    });

    it('emits exception as class kind, struct kind for union/struct', () => {
        const text = 'struct A {\n}\nunion B {\n}\nexception C {\n}';
        const tokens = tokensFor(text);
        const structKinds = tokens.filter(t => ['struct', 'class'].includes(tokenTypeName(t)));
        assert.strictEqual(structKinds.length, 3);
        const c = tokens.find(t => tokenTypeName(t) === 'class');
        assert.ok(c, 'expected exception → class token');
    });

    it('emits enum and enumMember tokens with readonly modifier', () => {
        const text = 'enum Color {\n  RED = 0,\n  GREEN = 1\n}';
        const tokens = tokensFor(text);
        const enumTok = findToken(tokens, t => tokenTypeName(t) === 'enum');
        const members = tokens.filter(t => tokenTypeName(t) === 'enumMember');
        assert.ok(enumTok, 'expected enum token');
        assert.strictEqual(members.length, 2);
        const readonlyIdx = SEMANTIC_TOKEN_MODIFIERS.indexOf('readonly');
        for (const m of members) {
            assert.ok((m.tokenModifiers & (1 << readonlyIdx)) !== 0, 'enumMember should be readonly');
        }
    });

    it('emits service and method tokens', () => {
        const text = 'service Greeter {\n  string hello(\n    1: string name\n  )\n}';
        const tokens = tokensFor(text);
        const iface = findToken(tokens, t => tokenTypeName(t) === 'interface');
        const method = findToken(tokens, t => tokenTypeName(t) === 'method');
        assert.ok(iface, 'expected interface (service) token');
        assert.ok(method, 'expected method token');
    });

    it('emits property tokens for struct fields and skips primitive type tokens', () => {
        const text = 'struct User {\n  1: string name,\n  2: i32 age\n}';
        const tokens = tokensFor(text);
        const props = tokens.filter(t => tokenTypeName(t) === 'property');
        assert.strictEqual(props.length, 2);
        // Should NOT have tokens for string/i32 (primitives)
        const types = tokens.filter(t => tokenTypeName(t) === 'type');
        // No user-defined types referenced, so no 'type' tokens
        assert.strictEqual(types.length, 0);
    });

    it('emits namespace + type tokens for Namespace.Type field references', () => {
        const text = 'struct Wrap {\n  1: shared.User user\n}';
        const tokens = tokensFor(text);
        const ns = tokens.find(t => tokenTypeName(t) === 'namespace');
        const typ = tokens.find(t => tokenTypeName(t) === 'type');
        assert.ok(ns, 'expected namespace token for shared');
        assert.ok(typ, 'expected type token for User');
        assert.ok(ns.startChar < typ.startChar);
    });

    it('emits typedef and const tokens with proper categories', () => {
        const text = 'typedef i32 UserId\nconst i32 MAX = 100';
        const tokens = tokensFor(text);
        const typedefTok = tokens.find(t => tokenTypeName(t) === 'type');
        const varTok = tokens.find(t => tokenTypeName(t) === 'variable');
        assert.ok(typedefTok, 'expected typedef alias as type token');
        assert.ok(varTok, 'expected const as variable token');
        const readonlyIdx = SEMANTIC_TOKEN_MODIFIERS.indexOf('readonly');
        assert.ok((varTok.tokenModifiers & (1 << readonlyIdx)) !== 0, 'const should be readonly');
    });

    it('tokens are sorted by (line, char)', () => {
        const text = 'struct A {\n  1: i32 a\n}\nstruct B {\n  1: i32 b\n}';
        const tokens = tokensFor(text);
        for (let i = 1; i < tokens.length; i++) {
            const prev = tokens[i - 1];
            const curr = tokens[i];
            assert.ok(
                prev.line < curr.line || (prev.line === curr.line && prev.startChar <= curr.startChar),
                `tokens at index ${i} not sorted: line ${prev.line}:${prev.startChar} vs ${curr.line}:${curr.startChar}`
            );
        }
    });

    it('empty document yields zero tokens', () => {
        const tokens = tokensFor('');
        assert.deepStrictEqual(tokens, []);
    });

    it('interaction maps to interface kind', () => {
        const text = 'interaction Calc {\n  i32 add(\n    1: i32 a,\n    2: i32 b\n  )\n}';
        const tokens = tokensFor(text);
        const iface = tokens.find(t => tokenTypeName(t) === 'interface');
        assert.ok(iface, 'expected interface token for interaction');
        const method = tokens.find(t => tokenTypeName(t) === 'method');
        assert.ok(method, 'expected method inside interaction');
    });

    it('provider returns SemanticTokens with deterministic data length', () => {
        const provider = new ThriftSemanticTokensProvider();
        const doc = createDoc('struct A {\n  1: i32 id\n}');
        const result = provider.provideDocumentSemanticTokens(doc, {isCancellationRequested: false});
        assert.ok(result instanceof vscode.SemanticTokens || result.data instanceof Uint32Array);
        assert.ok(result.data.length > 0, 'expected at least one token serialized');
        // each token = 5 uint32s
        assert.strictEqual(result.data.length % 5, 0);
    });

    it('respects cancellation token', () => {
        const provider = new ThriftSemanticTokensProvider();
        const doc = createDoc('struct A {\n  1: i32 id\n}');
        const result = provider.provideDocumentSemanticTokens(doc, {isCancellationRequested: true});
        // Returns empty SemanticTokens
        assert.ok(result.data instanceof Uint32Array);
        assert.strictEqual(result.data.length, 0);
    });

    it('handles malformed input without crashing', () => {
        const tokens = tokensFor('struct { unclosed');
        // Just verify it doesn't throw — may emit 0 or some tokens
        assert.ok(Array.isArray(tokens));
    });

    it('field with custom struct type emits property + type token', () => {
        const text = 'struct Address {\n  1: string city\n}\nstruct User {\n  1: Address addr\n}';
        const tokens = tokensFor(text);
        const props = tokens.filter(t => tokenTypeName(t) === 'property');
        const types = tokens.filter(t => tokenTypeName(t) === 'type');
        assert.ok(props.length >= 2);
        // Address reference in User should yield a type token
        const addressTok = types.find(t => t.length === 'Address'.length);
        assert.ok(addressTok, 'expected type token for Address reference');
    });
});
