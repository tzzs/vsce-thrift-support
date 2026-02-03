const assert = require('assert');
const path = require('path');
const {AstCache} = require('../../../out/references/ast-cache.js');
const {MemoryAwareCacheManager} = require('../../../out/utils/cache-manager.js');
const {config} = require('../../../out/config/index.js');

describe('ast-cache', () => {
    let vscode;
    let createTextDocument;

    before(() => {
        vscode = require('vscode');
        // 使用 require-hook 提供的 mock 中的方法
        createTextDocument = (text, uri) => {
            return {
                getText: () => text,
                uri: uri,
                languageId: 'thrift'
            };
        };
    });

    it('should reuse cached AST for same content', () => {

        const cache = new AstCache(60 * 1000);
        const uri = vscode.Uri.file(path.join(__dirname, 'test-files', 'main.thrift'));
        const doc = createTextDocument('struct User { 1: i32 id }', uri);

        const first = cache.get(doc);
        const second = cache.get(doc);

        assert.strictEqual(first, second);
    });

    it('should invalidate cache when content changes', () => {
        const cache = new AstCache(60 * 1000);
        const uri = vscode.Uri.file(path.join(__dirname, 'test-files', 'change.thrift'));
        const docA = createTextDocument('struct User { 1: i32 id }', uri);
        const docB = createTextDocument('struct User { 1: i32 id, 2: string name }', uri);

        const first = cache.get(docA);
        const second = cache.get(docB);

        assert.notStrictEqual(first, second);
    });

    it('should clear and delete cached AST', () => {
        const cache = new AstCache(60 * 1000);
        const uri = vscode.Uri.file(path.join(__dirname, 'test-files', 'clear.thrift'));
        const doc = createTextDocument('struct User { 1: i32 id }', uri);

        const first = cache.get(doc);
        cache.clear();
        const second = cache.get(doc);

        assert.notStrictEqual(first, second);

        cache.delete(uri.fsPath);
        const third = cache.get(doc);

        assert.notStrictEqual(second, third);

    });

    it('should reparse after ttl expires', async () => {
        const cache = new AstCache(10);
        const uri = vscode.Uri.file(path.join(__dirname, 'test-files', 'ttl.thrift'));
        const doc = createTextDocument('struct User { 1: i32 id }', uri);

        const first = cache.get(doc);

        await new Promise(resolve => setTimeout(resolve, 20));

        const second = cache.get(doc);

        assert.notStrictEqual(first, second);
    });

    it('should evict oldest entry when capacity is exceeded', () => {
        const cacheManager = MemoryAwareCacheManager.getInstance();
        cacheManager.registerCache('references-ast', {
            maxSize: 1,
            ttl: config.cache.references.ttlMs,
            lruK: config.cache.references.lruK,
            evictionThreshold: config.cache.references.evictionThreshold
        });

        const cache = new AstCache(config.cache.references.ttlMs);
        const uriA = vscode.Uri.file(path.join(__dirname, 'test-files', 'evict-a.thrift'));
        const uriB = vscode.Uri.file(path.join(__dirname, 'test-files', 'evict-b.thrift'));
        const docA = createTextDocument('struct A { 1: i32 id }', uriA);
        const docB = createTextDocument('struct B { 1: i32 id }', uriB);

        const first = cache.get(docA);
        const second = cache.get(docB);
        const third = cache.get(docA);

        assert.notStrictEqual(first, second);
        assert.notStrictEqual(first, third);
    });
});
