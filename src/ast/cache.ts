import * as vscode from 'vscode';
import * as nodes from './nodes.types';
import { config } from '../config';

interface ASTCacheEntry {
    content: string;
    ast: nodes.ThriftDocument;
    timestamp: number;
}

const astCache = new Map<string, ASTCacheEntry>();
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
 * 写入 AST 缓存。
 * @param uri 文档 URI
 * @param content 文档内容
 * @param ast 解析后的 AST
 * @returns void
 */
export function setCachedAst(uri: string, content: string, ast: nodes.ThriftDocument): void {
    astCache.set(uri, {
        content,
        ast,
        timestamp: Date.now()
    });
}

/**
 * 清理过期 AST 缓存。
 * @returns void
 */
export function clearExpiredAstCache(): void {
    const now = Date.now();
    for (const [uri, entry] of astCache.entries()) {
        if (now - entry.timestamp > CACHE_MAX_AGE) {
            astCache.delete(uri);
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
