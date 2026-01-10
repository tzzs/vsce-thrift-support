import * as vscode from 'vscode';
import * as nodes from '../ast/nodes.types';
import {config} from '../config';
import {LruCache} from '../utils/lru-cache';
import {rangeIntersectsLineRange} from '../utils/line-range';
import {BlockCache, BlockCacheValue, MemberCache, MemberCacheByBlock, MemberCacheValue, ThriftIssue} from './types';
import {hashText} from './utils';

/**
 * 创建块级诊断缓存。
 * @returns 块级缓存实例
 */
export function createBlockCache(): BlockCache {
    return new LruCache<string, BlockCacheValue>(
        config.cache.diagnosticsBlocks.maxSize,
        config.cache.diagnosticsBlocks.ttlMs
    );
}

/**
 * 创建成员缓存的分块容器。
 * @returns 成员分块缓存实例
 */
export function createMemberCacheByBlock(): MemberCacheByBlock {
    return new LruCache<string, MemberCache>(
        config.cache.diagnosticsBlocks.maxSize,
        config.cache.diagnosticsBlocks.ttlMs
    );
}

/**
 * 创建成员级缓存。
 * @returns 成员缓存实例
 */
export function createMemberCache(): MemberCache {
    return new LruCache<string, MemberCacheValue>(
        config.cache.diagnosticsMembers.maxSize,
        config.cache.diagnosticsMembers.ttlMs
    );
}

/**
 * 根据 AST 构建成员级缓存（按块分组）。
 * @param ast 当前 AST
 * @param lines 文档行内容
 * @param issues 当前诊断问题
 * @returns 成员缓存（按块分组）
 */
export function buildMemberCache(ast: nodes.ThriftDocument, lines: string[], issues: ThriftIssue[]) {
    const cache = createMemberCacheByBlock();
    for (const node of ast.body) {
        const blockKey = `${node.range.start.line}-${node.range.end.line}`;
        cache.set(blockKey, buildMemberCacheForNode(node, lines, issues));
    }
    return cache;
}

/**
 * 构建指定块节点内的成员缓存。
 * @param node 块节点
 * @param lines 文档行内容
 * @param issues 当前诊断问题
 * @returns 成员缓存
 */
export function buildMemberCacheForNode(
    node: nodes.ThriftDocument['body'][number],
    lines: string[],
    issues: ThriftIssue[]
) {
    const cache = createMemberCache();
    let members: Array<{ range: vscode.Range }> = [];
    if (node.type === nodes.ThriftNodeType.Struct || node.type === nodes.ThriftNodeType.Union || node.type === nodes.ThriftNodeType.Exception) {
        members = (node as nodes.Struct).fields;
    } else if (node.type === nodes.ThriftNodeType.Enum) {
        members = (node as nodes.Enum).members;
    } else if (node.type === nodes.ThriftNodeType.Service) {
        members = (node as nodes.Service).functions;
    }

    for (const member of members) {
        const startLine = member.range.start.line;
        const endLine = member.range.end.line;
        const memberText = lines.slice(startLine, endLine + 1).join('\n');
        const memberIssues = issues.filter(issue => rangeIntersectsLineRange(issue.range, {startLine, endLine}));
        const key = `${startLine}-${endLine}`;
        cache.set(key, {
            range: {startLine, endLine},
            hash: hashText(memberText),
            issues: memberIssues
        });
    }
    return cache;
}

/**
 * 构建块级缓存（每个顶级节点一条缓存）。
 * @param ast 当前 AST
 * @param lines 文档行内容
 * @param issues 当前诊断问题
 * @returns 块级缓存
 */

/**
 * 构建块级缓存（每个顶级节点一条缓存）。
 * @param ast 当前 AST
 * @param lines 文档行内容
 * @param issues 当前诊断问题
 * @returns 块级缓存
 */
/**
 * 构建块级缓存（每个顶级节点一条缓存）。
 * @param ast 当前 AST
 * @param lines 文档行内容
 * @param issues 当前诊断问题
 * @returns 块级缓存
 */
export function buildBlockCache(ast: nodes.ThriftDocument, lines: string[], issues: ThriftIssue[]) {
    const cache = createBlockCache();
    for (const node of ast.body) {
        const startLine = node.range.start.line;
        const endLine = node.range.end.line;
        const key = `${startLine}-${endLine}`;
        const blockText = lines.slice(startLine, endLine + 1).join('\n');
        const blockIssues = issues.filter(issue => rangeIntersectsLineRange(issue.range, {startLine, endLine}));
        cache.set(key, {hash: hashText(blockText), issues: blockIssues});
    }
    return cache;
}
