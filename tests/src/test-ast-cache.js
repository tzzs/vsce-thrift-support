const assert = require('assert');
const {
    getCachedAstRange,
    setCachedAstRange,
    clearAstRegionCacheForDocument,
    clearAstCacheForDocument,
    clearExpiredAstCache
} = require('../../out/ast/cache.js');

describe('AST Cache', () => {
    const testUri = 'test.thrift';

    afterEach(() => {
        clearAstRegionCacheForDocument(testUri);
    });

    it('returns null for uncached range', () => {
        const range = {startLine: 0, endLine: 5};
        const content = 'test content';

        const result = getCachedAstRange(testUri, range, content);
        assert.strictEqual(result, null);
    });

    it('caches and retrieves AST range', () => {
        const range = {startLine: 0, endLine: 5};
        const content = 'test content';
        const mockNodes = [
            {type: 'MockType1', range: {start: 0, end: 2}, name: 'node1'},
            {type: 'MockType2', range: {start: 3, end: 5}, name: 'node2'}
        ];

        setCachedAstRange(testUri, range, content, mockNodes);
        const cached = getCachedAstRange(testUri, range, content);

        assert.ok(cached !== null);
        assert.strictEqual(cached.length, 2);
        assert.strictEqual(cached[0].name, 'node1');
        assert.strictEqual(cached[1].name, 'node2');
    });

    it('does not return cached value for different content', () => {
        const range = {startLine: 0, endLine: 5};
        const content1 = 'test content 1';
        const content2 = 'test content 2';
        const mockNodes = [{type: 'MockType', name: 'node1'}];

        setCachedAstRange(testUri, range, content1, mockNodes);
        const cached = getCachedAstRange(testUri, range, content2);

        assert.strictEqual(cached, null);
    });

    it('does not return cached value for different range', () => {
        const range1 = {startLine: 0, endLine: 5};
        const range2 = {startLine: 1, endLine: 6};
        const content = 'test content';
        const mockNodes = [{type: 'MockType', name: 'node1'}];

        setCachedAstRange(testUri, range1, content, mockNodes);
        const cached = getCachedAstRange(testUri, range2, content);

        assert.strictEqual(cached, null);
    });

    it('replaces cached value for same range', () => {
        const range = {startLine: 0, endLine: 5};
        const content = 'test content';
        const mockNodes1 = [{type: 'MockType', name: 'node1'}];
        const mockNodes2 = [{type: 'MockType', name: 'node2'}];

        setCachedAstRange(testUri, range, content, mockNodes1);
        setCachedAstRange(testUri, range, content, mockNodes2);

        const cached = getCachedAstRange(testUri, range, content);
        assert.ok(cached !== null);
        assert.strictEqual(cached[0].name, 'node2');
    });

    it('clears region cache', () => {
        const range = {startLine: 0, endLine: 5};
        const content = 'test content';
        const mockNodes = [{type: 'MockType', name: 'node1'}];

        setCachedAstRange(testUri, range, content, mockNodes);
        assert.ok(getCachedAstRange(testUri, range, content));

        clearAstRegionCacheForDocument(testUri);
        const cachedAfter = getCachedAstRange(testUri, range, content);
        assert.strictEqual(cachedAfter, null);
    });

    it('clears region cache when clearing document cache', () => {
        const range = {startLine: 0, endLine: 5};
        const content = 'test content';
        const mockNodes = [{type: 'MockType', name: 'node1'}];

        setCachedAstRange(testUri, range, content, mockNodes);
        clearAstCacheForDocument(testUri);

        const cachedAfter = getCachedAstRange(testUri, range, content);
        assert.strictEqual(cachedAfter, null);
    });

    it('expires region cache entries', () => {
        const range = {startLine: 0, endLine: 5};
        const content = 'test content';
        const mockNodes = [{type: 'MockType', name: 'node1'}];

        const originalNow = Date.now;
        const base = originalNow();
        Date.now = () => base;
        setCachedAstRange(testUri, range, content, mockNodes);

        Date.now = () => base + 6 * 60 * 1000;
        clearExpiredAstCache();
        const cachedAfter = getCachedAstRange(testUri, range, content);
        assert.strictEqual(cachedAfter, null);

        Date.now = originalNow;
    });

    it('caches multiple ranges separately', () => {
        const range1 = {startLine: 0, endLine: 5};
        const range2 = {startLine: 6, endLine: 10};
        const content1 = 'test content 1';
        const content2 = 'test content 2';

        const mockNodes1 = [{type: 'MockType', name: 'node1'}];
        const mockNodes2 = [{type: 'MockType', name: 'node2'}];

        setCachedAstRange(testUri, range1, content1, mockNodes1);
        setCachedAstRange(testUri, range2, content2, mockNodes2);

        const cached1 = getCachedAstRange(testUri, range1, content1);
        const cached2 = getCachedAstRange(testUri, range2, content2);

        assert.ok(cached1 !== null);
        assert.ok(cached2 !== null);
        assert.strictEqual(cached1[0].name, 'node1');
        assert.strictEqual(cached2[0].name, 'node2');
    });
});
