import * as nodes from './nodes.types';
import {config} from '../config';
import {LineRange} from '../utils/line-range';

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

const astCache = new Map<string, ASTCacheEntry>();
const astRegionCache = new Map<string, ASTRegionCacheEntry[]>(); // Keyed by URI
const CACHE_MAX_AGE = config.cache.astMaxAgeMs;

/**
 * 获取缓存中的 AST（若命中且未过期）。
 * @param uri 文档 URI
 * @param content 文档内容
 * @returns 缓存命中时返回 AST，否则返回 null
 */
export function getCachedAst(uri: string, content: string): nodes.ThriftDocument | null {
    const now = Date.now();
    const cached = astCache.get(uri);
    if (cached && cached.content === content && (now - cached.timestamp) < CACHE_MAX_AGE) {
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

    if (!uriCache) {
        return null;
    }

    // Find cached entry for this specific range
    const cached = uriCache.find(entry =>
        entry.range.startLine === range.startLine &&
        entry.range.endLine === range.endLine &&
        entry.content === content &&
        (now - entry.timestamp) < CACHE_MAX_AGE
    );

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

    const uriCache = astRegionCache.get(uri)!;

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
}

/**
 * 清理指定文档的 AST 片段缓存。
 * @param uri 文档 URI
 * @returns void
 */
export function clearAstRegionCacheForDocument(uri: string): void {
    astRegionCache.delete(uri);
}

/**
 * 写入 AST 缓存。
 * @param uri 文档 URI
 * @param content 文档内容
 * @param ast 解析后的 AST
 * @returns void
 */
export function setCachedAst(uri: string, content: string, ast: nodes.ThriftDocument): void {
    const entry = {
        content,
        ast,
        timestamp: Date.now()
    };
    astCache.set(uri, entry);
}

/**
 * 清理过期 AST 缓存。
 * @returns void
 */
export function clearExpiredAstCache(): void {
    const now = Date.now();
    for (const [uri, entry] of Array.from(astCache.entries())) {
        if (now - entry.timestamp > CACHE_MAX_AGE) {
            astCache.delete(uri);
        }
    }

    for (const [uri, entries] of Array.from(astRegionCache.entries())) {
        const freshEntries = entries.filter(entry => (now - entry.timestamp) <= CACHE_MAX_AGE);
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
    astCache.delete(uri);
    astRegionCache.delete(uri);
}

/**
 * 解析并缓存 AST。
 * @param uri 文档 URI
 * @param content 文档内容
 * @param parse 解析函数
 * @returns AST
 */
export function parseWithAstCache(
    uri: string,
    content: string,
    parse: () => nodes.ThriftDocument
): nodes.ThriftDocument {
    const cached = getCachedAst(uri, content);
    if (cached) {
        return cached;
    }
    const ast = parse();
    setCachedAst(uri, content, ast);
    return ast;
}
