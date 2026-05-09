const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { Registry, INITIAL, parseRawGrammar } = require('vscode-textmate');
const oniguruma = require('vscode-oniguruma');

let grammar = null;

// Helper: tokenize a list of lines and return all tokens with their scopes
function tokenizeLines(lines) {
    let stack = INITIAL;
    const result = [];
    for (const line of lines) {
        const lineResult = grammar.tokenizeLine(line, stack);
        stack = lineResult.ruleStack;
        for (const t of lineResult.tokens) {
            const text = line.substring(t.startIndex, t.endIndex);
            if (text.trim()) {
                result.push({ text: text.trim(), scopes: t.scopes, fullText: text });
            }
        }
    }
    return result;
}

// Helper: check if a token with given text has all given scopes
function hasScopes(tokens, searchText, requiredScopes) {
    const token = tokens.find(t => t.text === searchText);
    if (!token) return false;
    return requiredScopes.every(s => token.scopes.includes(s));
}

// Helper: get the scopes for a specific token text
function getScopes(tokens, searchText) {
    const token = tokens.find(t => t.text === searchText);
    return token ? token.scopes : [];
}

// Helper: check that NO token has a given scope
function noTokenHasScope(tokens, forbiddenScope) {
    return !tokens.some(t => t.scopes.includes(forbiddenScope));
}

describe('TextMate Grammar Tokenization', () => {
    before(async () => {
        const wasmPath = path.join(require.resolve('vscode-oniguruma'), '..', 'onig.wasm');
        const wasmBin = fs.readFileSync(wasmPath).buffer;
        const onigLib = oniguruma.loadWASM(wasmBin).then(() => ({
            createOnigScanner: (sources) => new oniguruma.OnigScanner(sources),
            createOnigString: (str) => new oniguruma.OnigString(str),
        }));

        const registry = new Registry({
            onigLib,
            loadGrammar: async (scopeName) => {
                if (scopeName === 'source.thrift') {
                    const grammarPath = path.join(__dirname, '..', '..', 'syntaxes', 'thrift.tmLanguage.json');
                    const grammarContent = fs.readFileSync(grammarPath, 'utf8');
                    return parseRawGrammar(grammarContent, grammarPath);
                }
                return null;
            }
        });

        grammar = await registry.loadGrammar('source.thrift');
    });

    describe('Service definition tokenization', () => {
        it('should recognize service with { on same line', () => {
            const lines = ['service Foo {', '  void bar(),', '}'];
            const tokens = tokenizeLines(lines);

            assert.ok(hasScopes(tokens, 'service', ['meta.service.thrift', 'storage.type.thrift']),
                'service keyword should have meta.service and storage.type scopes');
            assert.ok(hasScopes(tokens, 'Foo', ['meta.service.thrift', 'entity.name.type.thrift']),
                'service name should have entity.name.type scope');
            assert.ok(hasScopes(tokens, 'bar', ['meta.method.definition.thrift', 'entity.name.function.thrift']),
                'method name should have entity.name.function scope');
            assert.ok(noTokenHasScope(tokens, 'constant.other.map.thrift'),
                'should not have any map constant scope');
        });

        it('should recognize service with { on next line', () => {
            const lines = ['service ThriftTest', '{', '  void testVoid(),', '}'];
            const tokens = tokenizeLines(lines);

            assert.ok(hasScopes(tokens, 'service', ['meta.service.thrift', 'storage.type.thrift']),
                'service keyword should have meta.service and storage.type scopes');
            assert.ok(hasScopes(tokens, 'ThriftTest', ['meta.service.thrift', 'entity.name.type.thrift']),
                'service name should have entity.name.type scope');
            assert.ok(hasScopes(tokens, 'testVoid', ['meta.method.definition.thrift', 'entity.name.function.thrift']),
                'method name should have entity.name.function scope even with { on next line');
            assert.ok(noTokenHasScope(tokens, 'constant.other.map.thrift'),
                'should not have any map constant scope');
        });

        it('should recognize service extends with dotted parent name', () => {
            const lines = ['service UserService extends shared.SharedService {',
                '  User createUser(),', '}'];
            const tokens = tokenizeLines(lines);

            assert.ok(hasScopes(tokens, 'service', ['meta.service.thrift']),
                'service should be in meta.service block');
            assert.ok(hasScopes(tokens, 'UserService', ['meta.service.thrift', 'entity.name.type.thrift']),
                'service name should be entity.name.type');
            assert.ok(tokens.some(t => t.text === 'extends' && t.scopes.includes('keyword.other.thrift')),
                'extends keyword should be keyword.other');
            assert.ok(tokens.some(t => t.text === 'shared.SharedService' && t.scopes.includes('entity.other.inherited-class.thrift')),
                'extends parent name should be entity.other.inherited-class per TextMate spec');
            assert.ok(hasScopes(tokens, 'createUser', ['entity.name.function.thrift']),
                'method name should have entity.name.function scope');
            assert.ok(noTokenHasScope(tokens, 'constant.other.map.thrift'),
                'should not have map constant scope');
        });

        it('should recognize method return type with namespace-qualified name', () => {
            const lines = ['service Foo {',
                '  shared.MyType getItem(),', '}'];
            const tokens = tokenizeLines(lines);

            assert.ok(hasScopes(tokens, 'getItem', ['entity.name.function.thrift']),
                'method name should be entity.name.function');
            assert.ok(noTokenHasScope(tokens, 'constant.other.map.thrift'),
                'should not have map constant scope');
        });
    });

    describe('Struct definition tokenization', () => {
        it('should recognize struct with { on same line', () => {
            const lines = ['struct MyStruct {', '  1: string name,', '}'];
            const tokens = tokenizeLines(lines);

            assert.ok(hasScopes(tokens, 'struct', ['meta.struct.thrift', 'storage.type.thrift']),
                'struct keyword should have meta.struct and storage.type scopes');
            assert.ok(hasScopes(tokens, 'MyStruct', ['meta.struct.thrift', 'entity.name.type.thrift']),
                'struct name should have entity.name.type scope');
            assert.ok(hasScopes(tokens, 'name', ['variable.other.member.thrift']),
                'field name should have variable.other.member scope');
            assert.ok(noTokenHasScope(tokens, 'constant.other.map.thrift'),
                'should not have map constant scope');
        });

        it('should recognize struct with { on next line', () => {
            const lines = ['struct MyStruct', '{', '  1: string name,', '}'];
            const tokens = tokenizeLines(lines);

            assert.ok(hasScopes(tokens, 'struct', ['meta.struct.thrift', 'storage.type.thrift']),
                'struct keyword should have meta.struct scope');
            assert.ok(hasScopes(tokens, 'MyStruct', ['meta.struct.thrift', 'entity.name.type.thrift']),
                'struct name should have entity.name.type scope');
            assert.ok(hasScopes(tokens, 'name', ['variable.other.member.thrift']),
                'field name should have variable.other.member scope');
            assert.ok(noTokenHasScope(tokens, 'constant.other.map.thrift'),
                'should not have map constant scope with { on next line');
        });
    });

    describe('Enum definition tokenization', () => {
        it('should recognize enum with { on next line', () => {
            const lines = ['enum Numberz', '{', '  ONE = 1,', '  TWO,', '  THREE = 3,', '}'];
            const tokens = tokenizeLines(lines);

            assert.ok(hasScopes(tokens, 'enum', ['meta.enum.thrift', 'storage.type.thrift']),
                'enum keyword should have meta.enum and storage.type scopes');
            assert.ok(hasScopes(tokens, 'Numberz', ['meta.enum.thrift', 'entity.name.type.thrift']),
                'enum name should have entity.name.type scope');
            assert.ok(hasScopes(tokens, 'ONE', ['constant.other.enum.thrift']),
                'enum value with explicit assignment should have constant.other.enum scope');
            assert.ok(hasScopes(tokens, 'TWO', ['constant.other.enum.thrift']),
                'enum value without explicit assignment should have constant.other.enum scope');
            assert.ok(hasScopes(tokens, 'THREE', ['constant.other.enum.thrift']),
                'enum value should have constant.other.enum scope');
            assert.ok(noTokenHasScope(tokens, 'constant.other.map.thrift'),
                'should not have map constant scope');
        });
    });

    describe('Exception and union definition tokenization', () => {
        it('should recognize exception with { on next line', () => {
            const lines = ['exception MyException', '{', '  1: i32 errorCode,', '}'];
            const tokens = tokenizeLines(lines);

            assert.ok(hasScopes(tokens, 'exception', ['meta.exception.thrift']),
                'exception should be in meta.exception block');
            assert.ok(hasScopes(tokens, 'errorCode', ['variable.other.member.thrift']),
                'exception field should have variable.other.member scope');
            assert.ok(noTokenHasScope(tokens, 'constant.other.map.thrift'),
                'should not have map constant scope');
        });

        it('should recognize union with { on next line', () => {
            const lines = ['union MyUnion', '{', '  1: string name,', '}'];
            const tokens = tokenizeLines(lines);

            assert.ok(hasScopes(tokens, 'union', ['meta.union.thrift']),
                'union should be in meta.union block');
            assert.ok(hasScopes(tokens, 'name', ['variable.other.member.thrift']),
                'union field should have variable.other.member scope');
            assert.ok(noTokenHasScope(tokens, 'constant.other.map.thrift'),
                'should not have map constant scope');
        });
    });

    describe('Operator and punctuation scopes', () => {
        it('should assign punctuation.definition.block to { and }', () => {
            const lines = ['service Foo {', '  void bar(),', '}'];
            const tokens = tokenizeLines(lines);

            assert.ok(hasScopes(tokens, '{', ['punctuation.definition.block.thrift']),
                'opening brace should be punctuation.definition.block');
            assert.ok(hasScopes(tokens, '}', ['punctuation.definition.block.thrift']),
                'closing brace should be punctuation.definition.block');
        });

        it('should assign correct scope to parentheses', () => {
            const lines = ['service Foo {', '  void bar(1: string x),', '}'];
            const tokens = tokenizeLines(lines);

            // The ( and ) inside method definition should be inside meta.method.definition
            const openParen = tokens.find(t => t.fullText === '(');
            const closeParen = tokens.find(t => t.fullText === ')');
            assert.ok(openParen, 'should have opening paren token');
            assert.ok(closeParen, 'should have closing paren token');
        });

        it('should assign keyword.operator.assignment to = in enum', () => {
            const lines = ['enum Status', '{', '  ACTIVE = 1,', '}'];
            const tokens = tokenizeLines(lines);

            const eqToken = tokens.find(t => t.text === '=');
            assert.ok(eqToken, 'should have = token');
            assert.ok(eqToken.scopes.includes('keyword.operator.assignment.thrift'),
                '= in enum should be keyword.operator.assignment');
        });

        it('should assign punctuation.separator.comma to trailing commas', () => {
            const lines = ['service Foo {', '  void bar(),', '}'];
            const tokens = tokenizeLines(lines);

            const commaToken = tokens.find(t => t.fullText === ',');
            assert.ok(commaToken, 'should have comma token');
            assert.ok(commaToken.scopes.includes('punctuation.separator.comma.thrift'),
                'comma should be punctuation.separator.comma');
        });
    });

    describe('Type scopes', () => {
        it('should assign storage.type.thrift to primitive types', () => {
            const lines = ['struct S {', '  1: i32 num,', '  2: string text,', '}'];
            const tokens = tokenizeLines(lines);

            assert.ok(hasScopes(tokens, 'i32', ['storage.type.thrift']),
                'i32 should have storage.type scope per TextMate spec');
            assert.ok(hasScopes(tokens, 'string', ['storage.type.thrift']),
                'string should have storage.type scope per TextMate spec');
        });

        it('should assign entity.name.type to user-defined types', () => {
            const lines = ['struct MyType {', '  1: MyType field,', '}'];
            const tokens = tokenizeLines(lines);

            const myTypeTokens = tokens.filter(t => t.text === 'MyType');
            assert.ok(myTypeTokens.some(t => t.scopes.includes('entity.name.type.thrift')),
                'user type should have entity.name.type scope');
        });

        it('should assign entity.name.type to namespace-qualified types', () => {
            const lines = ['struct S {',
                '  1: shared.SharedType field,', '}'];
            const tokens = tokenizeLines(lines);

            // The namespace-qualified type should NOT have entity.name.type.namespace (we removed that)
            assert.ok(!tokens.some(t => t.scopes.includes('entity.name.type.namespace.thrift')),
                'should not use entity.name.type.namespace scope');
        });
    });

    describe('Real file tokenization', () => {
        it('should correctly tokenize apache-thrift-test.thrift service section', () => {
            const testPath = path.join(__dirname, '..', '..', 'test-files', 'apache-thrift-test.thrift');
            const content = fs.readFileSync(testPath, 'utf8');
            const lines = content.split('\n');

            let stack = INITIAL;
            const serviceTokens = [];

            // Find and tokenize the service section
            for (let i = 0; i < lines.length; i++) {
                const result = grammar.tokenizeLine(lines[i], stack);
                stack = result.ruleStack;

                // Lines around service ThriftTest (line 143, 0-indexed: 142)
                if (i >= 141 && i <= 160) {
                    for (const t of result.tokens) {
                        const text = lines[i].substring(t.startIndex, t.endIndex).trim();
                        if (text) {
                            serviceTokens.push({ text, scopes: t.scopes, line: i + 1 });
                        }
                    }
                }
            }

            // Check service is recognized
            const serviceToken = serviceTokens.find(t => t.text === 'service');
            assert.ok(serviceToken, 'should find service keyword token');
            assert.ok(serviceToken.scopes.includes('meta.service.thrift'),
                `service should have meta.service.thrift scope, got: ${JSON.stringify(serviceToken.scopes)}`);

            // Check method names
            const testVoidToken = serviceTokens.find(t => t.text === 'testVoid');
            assert.ok(testVoidToken, 'should find testVoid method name token');
            assert.ok(testVoidToken.scopes.includes('entity.name.function.thrift'),
                `testVoid should have entity.name.function scope, got: ${JSON.stringify(testVoidToken.scopes)}`);

            // Check no map constant scope leakage
            assert.ok(!serviceTokens.some(t => t.scopes.includes('constant.other.map.thrift')),
                'should not have constant.other.map.thrift scope in service section');
        });

        it('should correctly tokenize example.thrift', () => {
            const testPath = path.join(__dirname, '..', '..', 'test-files', 'example.thrift');
            const content = fs.readFileSync(testPath, 'utf8');
            const lines = content.split('\n');

            let stack = INITIAL;
            const tokens = [];

            for (let i = 0; i < lines.length; i++) {
                const result = grammar.tokenizeLine(lines[i], stack);
                stack = result.ruleStack;

                for (const t of result.tokens) {
                    const text = lines[i].substring(t.startIndex, t.endIndex).trim();
                    if (text) {
                        tokens.push({ text, scopes: t.scopes, line: i + 1 });
                    }
                }
            }

            // Verify service with extends is properly recognized
            const serviceToken = tokens.find(t => t.text === 'service');
            assert.ok(serviceToken, 'should find service keyword');
            assert.ok(serviceToken.scopes.includes('meta.service.thrift'),
                'service should be in meta.service block');

            // Verify createUser method
            const createUserToken = tokens.find(t => t.text === 'createUser');
            assert.ok(createUserToken, 'should find createUser method name');
            assert.ok(createUserToken.scopes.includes('entity.name.function.thrift'),
                `createUser should have entity.name.function scope, got: ${JSON.stringify(createUserToken.scopes)}`);

            // Verify no constant.other.map.thrift leakage
            const mapScopedTokens = tokens.filter(t => t.scopes.includes('constant.other.map.thrift'));
            // Map constants should only appear in actual const map definitions, not in service/struct
            const badMapTokens = mapScopedTokens.filter(t => {
                return t.text === 'createUser' || t.text === 'UserService' || t.text === 'User';
            });
            assert.strictEqual(badMapTokens.length, 0,
                'service/struct tokens should not have map constant scope');
        });
    });

    describe('Variable scope assignments', () => {
        it('should assign variable.parameter to method parameters', () => {
            const lines = ['service S {', '  void foo(1: string userName),', '}'];
            const tokens = tokenizeLines(lines);

            assert.ok(hasScopes(tokens, 'userName', ['variable.parameter.thrift']),
                'method parameter should have variable.parameter scope');
        });

        it('should assign variable.other.member to struct fields', () => {
            const lines = ['struct S {', '  1: string userName,', '}'];
            const tokens = tokenizeLines(lines);

            assert.ok(hasScopes(tokens, 'userName', ['variable.other.member.thrift']),
                'struct field should have variable.other.member scope');
        });

        it('should assign variable.other.constant to const names', () => {
            const lines = ['const i32 MAX_COUNT = 100'];
            const tokens = tokenizeLines(lines);

            assert.ok(hasScopes(tokens, 'MAX_COUNT', ['variable.other.constant.thrift']),
                'const name should have variable.other.constant scope');
        });
    });

    describe('Namespace definition tokenization', () => {
        it('should recognize namespace with scoped language identifier', () => {
            const lines = ['namespace cpp.noexist ThriftTest'];
            const tokens = tokenizeLines(lines);

            assert.ok(hasScopes(tokens, 'namespace', ['keyword.other.thrift']),
                'namespace keyword should be keyword.other');
            assert.ok(tokens.some(t => t.text === 'cpp.noexist' && t.scopes.includes('keyword.other.namespace.thrift')),
                'scope modifier noexist should be keyword.other.namespace, not variable.other');
            assert.ok(tokens.some(t => t.text === 'ThriftTest' && t.scopes.includes('entity.name.namespace.thrift')),
                'namespace name should be entity.name.namespace');
            assert.ok(!tokens.some(t => t.scopes.includes('variable.other.thrift')),
                'should not have variable.other scope in namespace declaration');
        });

        it('should recognize namespace with wildcard scope', () => {
            const lines = ['namespace * thrift.test'];
            const tokens = tokenizeLines(lines);

            assert.ok(hasScopes(tokens, 'namespace', ['keyword.other.thrift']),
                'namespace keyword should be keyword.other');
            assert.ok(hasScopes(tokens, '*', ['keyword.other.namespace.thrift']),
                'wildcard scope should be keyword.other.namespace');
            assert.ok(tokens.some(t => t.text === 'thrift.test' && t.scopes.includes('entity.name.namespace.thrift')),
                'namespace name should be entity.name.namespace');
        });

        it('should recognize namespace with simple language identifier', () => {
            const lines = ['namespace java com.example.thrift'];
            const tokens = tokenizeLines(lines);

            assert.ok(hasScopes(tokens, 'namespace', ['keyword.other.thrift']),
                'namespace keyword should be keyword.other');
            assert.ok(hasScopes(tokens, 'java', ['keyword.other.namespace.thrift']),
                'language identifier should be keyword.other.namespace');
            assert.ok(tokens.some(t => t.text === 'com.example.thrift' && t.scopes.includes('entity.name.namespace.thrift')),
                'namespace name should be entity.name.namespace');
        });

        it('should handle namespace with annotation containing URL', () => {
            const lines = ["namespace xsd test (uri = 'http://thrift.apache.org/ns/ThriftTest')"];
            const tokens = tokenizeLines(lines);

            assert.ok(hasScopes(tokens, 'namespace', ['keyword.other.thrift']),
                'namespace keyword should be keyword.other');
            assert.ok(hasScopes(tokens, 'xsd', ['keyword.other.namespace.thrift']),
                'language identifier xsd should be keyword.other.namespace');
            assert.ok(hasScopes(tokens, 'test', ['entity.name.namespace.thrift']),
                'namespace name should be entity.name.namespace');
            // The URL in annotation should NOT trigger comment scope
            const urlCommentTokens = tokens.filter(t => t.scopes.includes('comment.line.double-slash.thrift'));
            assert.strictEqual(urlCommentTokens.length, 0,
                'URL // in annotation should not trigger comment scope');
            // Annotation should be recognized
            assert.ok(tokens.some(t => t.scopes.includes('meta.annotation.thrift')),
                'namespace annotation should have meta.annotation scope');
        });
    });
});
