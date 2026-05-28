const assert = require('assert');
const {ThriftParser} = require('../../../out/ast/parser.js');
const {CacheManager} = require('../../../out/utils/cache-manager.js');
const {ErrorHandler} = require('../../../out/utils/error-handler.js');

describe('Boundary Conditions', () => {
    describe('Field ID boundaries', () => {
        it('should parse field ID = 1 (minimum valid)', () => {
            const ast = new ThriftParser('struct S {\n  1: string f\n}').parse();
            assert.strictEqual(ast.body[0].fields[0].id, 1);
        });

        it('should parse field ID = 32767 (i16 max)', () => {
            const ast = new ThriftParser('struct S {\n  32767: string f\n}').parse();
            assert.strictEqual(ast.body[0].fields[0].id, 32767);
        });

        it('should parse field ID = 2147483647 (i32 max)', () => {
            const ast = new ThriftParser('struct S {\n  2147483647: string f\n}').parse();
            assert.strictEqual(ast.body[0].fields[0].id, 2147483647);
        });

        it('should parse negative field ID', () => {
            const ast = new ThriftParser('struct S {\n  -1: string f\n}').parse();
            assert.ok(ast, 'should not crash on negative field ID');
        });

        it('should parse field ID = 0', () => {
            const ast = new ThriftParser('struct S {\n  0: string f\n}').parse();
            assert.ok(ast, 'should not crash on field ID 0');
        });
    });

    describe('Nested generic types', () => {
        it('should parse deeply nested generics', () => {
            const content = 'typedef list<map<string, set<list<i32>>>> DeepType';
            const ast = new ThriftParser(content).parse();
            assert.strictEqual(ast.body.length, 1);
            assert.strictEqual(ast.body[0].type, 'Typedef');
        });

        it('should parse map with complex key and value types', () => {
            const content = 'typedef map<string, list<map<i32, set<string>>>> ComplexMap';
            const ast = new ThriftParser(content).parse();
            assert.strictEqual(ast.body.length, 1);
        });

        it('should handle 5 levels of nesting without stack overflow', () => {
            const content = 'typedef list<list<list<list<list<string>>>>> FiveDeep';
            const ast = new ThriftParser(content).parse();
            assert.ok(ast, 'should not crash on 5 levels of nesting');
        });
    });

    describe('Service method boundaries', () => {
        it('should parse service with no methods', () => {
            const ast = new ThriftParser('service Empty {}').parse();
            assert.strictEqual(ast.body[0].functions.length, 0);
        });

        it('should parse service method with 20 arguments', () => {
            const args = Array.from({length: 20}, (_, i) => `${i + 1}: string arg${i}`).join(', ');
            const content = `service S {\n  void manyArgs(${args})\n}`;
            const ast = new ThriftParser(content).parse();
            assert.ok(ast.body[0].functions[0].arguments.length > 0);
        });

        it('should parse service with many throws clauses', () => {
            const content = `
                exception E1 {}
                exception E2 {}
                exception E3 {}
                service S { void op() throws (1: E1 e1, 2: E2 e2, 3: E3 e3) }
            `;
            const ast = new ThriftParser(content).parse();
            assert.strictEqual(ast.body.length, 4);
        });
    });

    describe('Enum value boundaries', () => {
        it('should parse enum with maximum i32 value', () => {
            const content = 'enum E {\n  MAX = 2147483647\n}';
            const ast = new ThriftParser(content).parse();
            assert.strictEqual(Number(ast.body[0].members[0].initializer), 2147483647);
        });

        it('should parse enum with negative values', () => {
            const content = 'enum E {\n  NEG = -1,\n  ZERO = 0,\n  POS = 1\n}';
            const ast = new ThriftParser(content).parse();
            assert.strictEqual(ast.body[0].members.length, 3);
        });

        it('should parse enum with hex values', () => {
            const content = 'enum E {\n  HEX = 0xFF\n}';
            const ast = new ThriftParser(content).parse();
            assert.ok(ast.body[0].members[0], 'should parse hex enum value');
        });
    });

    describe('CacheManager eviction at exact maxSize boundary', () => {
        let cacheManager;

        beforeEach(() => {
            cacheManager = CacheManager.getInstance();
            // evictionThreshold:1.0 disables early eviction so we can test exact maxSize boundary
            cacheManager.registerCache('boundary-test', {maxSize: 3, ttl: 60000, evictionThreshold: 1.0});
        });

        afterEach(() => {
            cacheManager.clear('boundary-test');
        });

        it('should hold exactly maxSize items', () => {
            cacheManager.set('boundary-test', 'a', 1);
            cacheManager.set('boundary-test', 'b', 2);
            cacheManager.set('boundary-test', 'c', 3);
            const stats = cacheManager.getCacheStats('boundary-test');
            assert.strictEqual(stats.size, 3);
        });

        it('should evict LRU entry when maxSize+1 item is inserted', () => {
            cacheManager.set('boundary-test', 'a', 1);
            cacheManager.set('boundary-test', 'b', 2);
            cacheManager.set('boundary-test', 'c', 3);
            // Access 'b' and 'c' to make 'a' the LRU
            cacheManager.get('boundary-test', 'b');
            cacheManager.get('boundary-test', 'c');
            // Insert 4th item — 'a' should be evicted
            cacheManager.set('boundary-test', 'd', 4);
            const stats = cacheManager.getCacheStats('boundary-test');
            assert.ok(stats.size <= 3, 'size should not exceed maxSize after eviction');
            assert.strictEqual(cacheManager.get('boundary-test', 'd'), 4, 'd should be present');
        });

        it('should return undefined for missing key without error', () => {
            const result = cacheManager.get('boundary-test', 'nonexistent');
            assert.strictEqual(result, undefined);
        });
    });

    describe('ErrorHandler concurrent safety', () => {
        it('should count errors correctly under concurrent calls', async () => {
            const handler = new ErrorHandler();
            const N = 50;
            await Promise.all(
                Array.from({length: N}, (_, i) =>
                    Promise.resolve().then(() =>
                        handler.handleError(new Error(`err${i}`), {component: 'C', operation: 'op'})
                    )
                )
            );
            assert.strictEqual(handler.getErrorStats().total, N, `should count all ${N} errors`);
        });

        it('should not lose warning counts under concurrent warnings', async () => {
            const handler = new ErrorHandler();
            const N = 30;
            await Promise.all(
                Array.from({length: N}, (_, i) =>
                    Promise.resolve().then(() =>
                        handler.handleWarning(`warn${i}`, {component: 'C', operation: 'op'})
                    )
                )
            );
            assert.strictEqual(handler.getErrorStats().warnings, N);
        });
    });

    describe('Parser: multi-definition files', () => {
        it('should parse 100 top-level structs', () => {
            const content = Array.from({length: 100}, (_, i) =>
                `struct Struct${i} { 1: string f }`
            ).join('\n');
            const ast = new ThriftParser(content).parse();
            assert.strictEqual(ast.body.length, 100);
        });

        it('should parse mixed top-level definitions', () => {
            const content = `
                namespace go test
                include "other.thrift"
                typedef string Alias
                const i32 VERSION = 1
                enum Status { OK = 0, ERR = 1 }
                struct Request { 1: string id }
                exception AppError { 1: string msg }
                service API { void ping() }
            `;
            const ast = new ThriftParser(content).parse();
            assert.strictEqual(ast.body.length, 8, 'should parse all 8 definition types');
        });
    });
});
