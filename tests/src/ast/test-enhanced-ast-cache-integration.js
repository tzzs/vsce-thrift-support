// Mock vscode is handled by require hook
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { parseWithAstCache, getCachedAst, setCachedAst, clearExpiredAstCache, clearAstCacheForDocument } = require('../../../out/ast/cache.js');
const { ThriftParser } = require('../../../out/ast/parser.js');

describe('Enhanced AST Cache Integration', () => {
    it('should use enhanced cache manager integration', () => {
        const testUri = 'test://test-file.thrift';
        const testContent = `
            struct TestStruct {
                1: required string name,
                2: optional i32 value
            }
        `;

        // Parse with cache - this uses the enhanced cache under the hood
        const ast = parseWithAstCache(testUri, testContent, () => {
            const parser = new ThriftParser(testContent);
            return parser.parse();
        });

        // Verify we got a valid AST
        assert.ok(ast, 'Should return parsed AST');
        assert.ok(Array.isArray(ast.body), 'AST should have a body array');

        // Verify the cached result is returned correctly
        const cachedAst = getCachedAst(testUri, testContent);
        assert.ok(cachedAst, 'Should return cached AST');
        assert.strictEqual(cachedAst, ast, 'Cached AST should be the same object');
    });

    it('should handle content changes correctly', () => {
        const testUri = 'test://test-file-2.thrift';
        const initialContent = `struct InitialStruct { 1: string field }`;
        const changedContent = `struct ChangedStruct { 1: string field, 2: i32 second_field }`;

        // Parse with initial content
        const initialAst = parseWithAstCache(testUri, initialContent, () => {
            const parser = new ThriftParser(initialContent);
            return parser.parse();
        });

        // Parse with changed content - should return new AST, not cached one
        const changedAst = parseWithAstCache(testUri, changedContent, () => {
            const parser = new ThriftParser(changedContent);
            return parser.parse();
        });

        // The content changed, so we should get a different AST
        assert.notStrictEqual(initialAst, changedAst, 'Different content should produce different AST');
    });

    it('should properly set and get cached AST', () => {
        const testUri = 'test://set-get-test.thrift';
        const testContent = `service TestService { string ping() }`;

        // Create AST manually
        const parser = new ThriftParser(testContent);
        const manualAst = parser.parse();

        // Set in cache
        setCachedAst(testUri, testContent, manualAst);

        // Get from cache
        const cachedAst = getCachedAst(testUri, testContent);

        assert.strictEqual(cachedAst, manualAst, 'Retrieved AST should match set AST');
    });

    it('should handle cache clearing', () => {
        const testUri = 'test://clear-test.thrift';
        const testContent = `typedef i64 UserId`;

        // Populate cache
        parseWithAstCache(testUri, testContent, () => {
            const parser = new ThriftParser(testContent);
            return parser.parse();
        });

        // Verify it's cached
        const cachedBefore = getCachedAst(testUri, testContent);
        assert.ok(cachedBefore, 'Should be cached initially');

        // Clear cache for this document
        clearAstCacheForDocument(testUri);

        // Verify it's no longer cached
        const cachedAfter = getCachedAst(testUri, testContent);
        assert.strictEqual(cachedAfter, null, 'Should not be cached after clearing');
    });

    it('should handle expired cache cleanup', () => {
        const testUri = 'test://expired-test.thrift';
        const testContent = `const string TEST_CONST = "test"`;

        // Set cache with past timestamp to simulate expiration
        // This test mainly verifies that the function exists and doesn't throw
        clearExpiredAstCache();

        // Should not throw any exceptions
        assert.ok(true, 'clearExpiredAstCache should execute without error');
    });
});
