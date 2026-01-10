import * as vscode from 'vscode';
import * as nodes from '../ast/nodes.types';
import {LineRange, normalizeLineRange, rangeIntersectsLineRange} from '../utils/line-range';
import {AnalysisContext} from './rules/analysis-context';
import {BlockAstCacheEntry, BlockCache, MemberCacheByBlock} from './types';

export interface DocumentDiagnosticState {
    /** 文档版本号 */
    version: number;
    /** 是否正在分析 */
    isAnalyzing: boolean;
    /** 上次分析完成时间戳 */
    lastAnalysis?: number;
    /** 脏行数量 */
    dirtyLineCount?: number;
    /** include 是否可能发生变化 */
    includesMayChange?: boolean;
    /** 是否复用缓存的 include 类型 */
    useCachedIncludes?: boolean;
    /** 是否启用增量诊断 */
    useIncrementalDiagnostics?: boolean;
    /** 归并后的脏范围 */
    dirtyRange?: LineRange;
    /** 多段脏范围 */
    dirtyRanges?: LineRange[];
    /** 上次诊断结果 */
    lastDiagnostics?: vscode.Diagnostic[];
    /** 上次 AST */
    lastAst?: nodes.ThriftDocument;
    /** 上次分析上下文 */
    lastAnalysisContext?: AnalysisContext;
    /** 块级缓存 */
    lastBlockCache?: BlockCache;
    /** 成员级缓存 */
    lastMemberCache?: MemberCacheByBlock;
    /** AST 子树缓存 */
    blockAstCache?: Map<string, BlockAstCacheEntry>;
}

export function mergeBlockIntoAst(ast: nodes.ThriftDocument, blockNode: nodes.ThriftNode, blockRange: LineRange) {
    if (!blockNode) {
        return;
    }
    const normalized = normalizeLineRange(blockRange);
    if (!normalized) {
        return;
    }

    const mergedBody: nodes.ThriftNode[] = [];
    let inserted = false;
    for (const node of ast.body) {
        if (rangeIntersectsLineRange(node.range, normalized)) {
            continue;
        }
        if (!inserted && node.range.start.line > normalized.startLine) {
            blockNode.parent = ast;
            mergedBody.push(blockNode);
            inserted = true;
        }
        mergedBody.push(node);
    }

    if (!inserted) {
        blockNode.parent = ast;
        mergedBody.push(blockNode);
    }

    ast.body = mergedBody;
}
