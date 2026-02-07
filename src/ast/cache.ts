import * as nodes from './nodes.types';
import {config} from '../config';
import {LineRange} from '../utils/line-range';
import {CacheManager} from '../utils/cache-manager'; // Import the enhanced cache manager
import {makeUriContentKey, makeUriRangeKey} from '../utils/cache-keys';
import {isExpired, isFresh} from '../utils/cache-expiry';
import {OptimizedThriftParser} from './optimized-parser';
// Only export optimized parser if it hasn't been exported already

// Initialize the cache manager
const cacheManager = CacheManager.getInstance();

// Register AST cache configurations
cacheManager.registerCache('ast-full', {
    maxSize: 100, // Reasonable default, can be configured
    ttl: config.cache.astMaxAgeMs,
    lruK: 2,
    evictionThreshold: 0.8
});

cacheManager.registerCache('ast-region', {
    maxSize: 200, // May have more regions than full ASTs
    ttl: config.cache.astMaxAgeMs,
    lruK: 2,
    evictionThreshold: 0.7 // Slightly more aggressive for regions
});

interface ASTCacheEntry {
    content: string;
    ast: nodes.ThriftDocument;
    timestamp: number;
}

// New interface for region-based cache entries
interface ASTRegionCacheEntry {
    content: string;
    regionAST: nodes.ThriftNode[];
    range: LineRange;
    timestamp: number;
}

// Use the new cache manager for primary caches
const astCache = new Map<string, ASTCacheEntry>();
const astRegionCache = new Map<string, ASTRegionCacheEntry[]>(); // Keyed by URI
const CACHE_MAX_AGE = config.cache.astMaxAgeMs;

/**
 * 获取缓存中的 AST（若命中且未过期）。
 * @param uri 文档 URI
 * @param content 文档内容
 * @param version 版本号（可选）
 * @returns 缓存命中时返回 AST，否则返回 null
 */
export function getCachedAst(uri: string, content: string, version?: number): nodes.ThriftDocument | null {
    const now = Date.now();

    // 尝试使用优化的缓存键查找
    const cacheKey = makeUriContentKey(uri, content, version);

    // 先检查 astCache Map
    const cached = astCache.get(cacheKey) || astCache.get(uri); // 向后兼容

    if (cached && cached.content === content && isFresh(cached.timestamp, CACHE_MAX_AGE, now)) {
        // Notify the cache manager about access for memory awareness
        cacheManager.get('ast-full', cacheKey);
        return cached.ast;
    }

    return null;
}

/**
 * 获取缓存中的 AST 片段（若命中且未过期）。
 * @param uri 文档 URI
 * @param range 行范围
 * @param content 片段内容
 * @returns 缓存命中时返回 AST 片段，否则返回 null
 */
export function getCachedAstRange(uri: string, range: LineRange, content: string): nodes.ThriftNode[] | null {
    const now = Date.now();
    const uriCache = astRegionCache.get(uri);
    const cacheKey = makeUriRangeKey(uri, range);

    if (!uriCache) {
        // Notify the cache manager about access
        cacheManager.get('ast-region', cacheKey);
        return null;
    }

    // Find cached entry for this specific range
    const cached = uriCache.find(entry =>
        entry.range.startLine === range.startLine &&
        entry.range.endLine === range.endLine &&
        entry.content === content &&
        isFresh(entry.timestamp, CACHE_MAX_AGE, now)
    );

    if (cached) {
        // Notify the cache manager about access for memory awareness
        cacheManager.get('ast-region', cacheKey);
    }

    return cached ? cached.regionAST : null;
}

/**
 * 写入 AST 片段缓存。
 * @param uri 文档 URI
 * @param range 行范围
 * @param content 片段内容
 * @param ast 解析后的 AST 片段
 * @returns void
 */
export function setCachedAstRange(uri: string, range: LineRange, content: string, ast: nodes.ThriftNode[]): void {
    if (!astRegionCache.has(uri)) {
        astRegionCache.set(uri, []);
    }

    let uriCache = astRegionCache.get(uri);
    if (!uriCache) {
        uriCache = [];
        astRegionCache.set(uri, uriCache);
    }

    // Remove existing entry for this range to avoid duplicates
    const existingIndex = uriCache.findIndex(entry =>
        entry.range.startLine === range.startLine &&
        entry.range.endLine === range.endLine
    );

    if (existingIndex !== -1) {
        uriCache.splice(existingIndex, 1);
    }

    // Add new entry
    uriCache.push({
        content,
        regionAST: ast,
        range,
        timestamp: Date.now()
    });

    // Limit the number of entries per URI to prevent memory issues
    if (uriCache.length > 50) { // Use a reasonable constant instead of config value
        uriCache.shift(); // Remove oldest entry
    }

    // Notify the cache manager about the set operation for memory awareness
    cacheManager.set('ast-region', makeUriRangeKey(uri, range), ast);
}

/**
 * 清理指定文档的 AST 片段缓存。
 * @param uri 文档 URI
 * @returns void
 */
export function clearAstRegionCacheForDocument(uri: string): void {
    const entries = astRegionCache.get(uri);
    if (entries) {
        for (const entry of entries) {
            cacheManager.delete('ast-region', makeUriRangeKey(uri, entry.range));
        }
    }
    astRegionCache.delete(uri);
}

/**
 * 写入 AST 缓存。
 * @param uri 文档 URI
 * @param content 文档内容
 * @param ast 解析后的 AST
 * @param version 版本号（可选）
 * @returns void
 */
export function setCachedAst(uri: string, content: string, ast: nodes.ThriftDocument, version?: number): void {
    const entry = {
        content,
        ast,
        timestamp: Date.now()
    };

    // 使用优化的缓存键
    const cacheKey = makeUriContentKey(uri, content, version);

    astCache.set(cacheKey, entry);

    // Notify the cache manager about the set operation for memory awareness
    cacheManager.set('ast-full', cacheKey, entry);
}

/**
 * 清理过期 AST 缓存。
 * @returns void
 */
export function clearExpiredAstCache(): void {
    const now = Date.now();
    for (const [uri, entry] of Array.from(astCache.entries())) {
        if (isExpired(entry.timestamp, CACHE_MAX_AGE, now)) {
            astCache.delete(uri);
            cacheManager.delete('ast-full', uri);
        }
    }

    for (const [uri, entries] of Array.from(astRegionCache.entries())) {
        const freshEntries = entries.filter(entry => isFresh(entry.timestamp, CACHE_MAX_AGE, now));
        const expiredEntries = entries.filter(entry => isExpired(entry.timestamp, CACHE_MAX_AGE, now));
        for (const entry of expiredEntries) {
            cacheManager.delete('ast-region', makeUriRangeKey(uri, entry.range));
        }
        if (freshEntries.length === 0) {
            astRegionCache.delete(uri);
        } else if (freshEntries.length !== entries.length) {
            astRegionCache.set(uri, freshEntries);
        }
    }
}

/**
 * 清理指定文档的 AST 缓存。
 * @param uri 文档 URI
 * @returns void
 */
export function clearAstCacheForDocument(uri: string): void {
    // Clear all entries that start with the URI
    for (const key of astCache.keys()) {
        if (key.startsWith(uri)) {
            astCache.delete(key);
            cacheManager.delete('ast-full', key);
        }
    }
    clearAstRegionCacheForDocument(uri);
}

/**
 * 解析并缓存 AST。
 * @param uri 文档 URI
 * @param content 文档内容
 * @param parse 解析函数
 * @param version 版本号（可选）
 * @returns AST
 */
export function parseWithAstCache(
    uri: string,
    content: string,
    parse: () => nodes.ThriftDocument,
    version?: number
): nodes.ThriftDocument {
    const cached = getCachedAst(uri, content, version);
    if (cached) {
        return cached;
    }
    const ast = parse();
    setCachedAst(uri, content, ast, version);
    return ast;
}

// Don't re-export if already defined in original module

// Export optimized parser
export {OptimizedThriftParser as ThriftParser};
