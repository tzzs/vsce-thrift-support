import * as path from 'path';
import * as vscode from 'vscode';
import { ThriftParser } from '../ast/parser';
import * as nodes from '../ast/nodes.types';
import { config } from '../config';
import { ErrorHandler } from '../utils/error-handler';
import { LruCache } from '../utils/lru-cache';
import {
    LineRange,
    normalizeLineRange,
    rangeIntersectsLineRange
} from '../utils/line-range';
import { PerformanceMonitor, performanceMonitor } from '../performance-monitor';
import { ThriftIssue, BlockCache, BlockCacheValue, MemberCache, MemberCacheByBlock, MemberCacheValue } from './types';
import { logDiagnostics } from './logger';
import {
    clearIncludeCacheForDocument,
    collectIncludedTypes,
    collectIncludedTypesFromCache,
    getIncludedFiles
} from './include-resolver';
import { AnalysisContext, analyzeThriftAst, buildAnalysisContext } from './rules';
import {
    buildPartialLines,
    findBestContainingMemberRangeForChanges,
    findBestContainingRangeForChanges,
    findContainingNode,
    hashText
} from './utils';

interface DocumentDiagnosticState {
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
}

/**
 * DiagnosticManager：负责诊断调度、缓存与依赖跟踪。
 */
export class DiagnosticManager {
    /** VS Code 诊断集合 */
    private collection: vscode.DiagnosticCollection;
    /** 分析队列（按文档 key 管理） */
    private analysisQueue = new Map<string, NodeJS.Timeout>();
    /** 文档诊断状态缓存 */
    private documentStates = new Map<string, DocumentDiagnosticState>();
    /** 诊断延迟（毫秒） */
    private readonly ANALYSIS_DELAY = config.diagnostics.analysisDelayMs;
    /** 最小分析间隔（毫秒） */
    private readonly MIN_ANALYSIS_INTERVAL = config.diagnostics.minAnalysisIntervalMs;
    /** 并发诊断上限 */
    private readonly MAX_CONCURRENT_ANALYSES = Math.max(1, config.diagnostics.maxConcurrentAnalyses);
    /** 当前分析中的任务数量 */
    private inFlightAnalyses = 0;
    /** 等待队列（用于并发控制） */
    private analysisWaiters: Array<() => void> = [];
    /** 已排队但未执行的文档 key */
    private pendingAnalyses = new Set<string>();

    /** 文件依赖跟踪：被 include 的文件 -> 依赖它的文件集合 */
    private fileDependencies = new Map<string, Set<string>>();
    /** 反向依赖跟踪：文件 -> 它 include 的文件集合 */
    private fileIncludes = new Map<string, Set<string>>();
    /** 错误处理器 */
    private errorHandler: ErrorHandler;
    /** 性能监控器 */
    private performanceMonitor: PerformanceMonitor;

    constructor(errorHandler?: ErrorHandler, performanceMonitorInstance?: PerformanceMonitor) {
        this.errorHandler = errorHandler ?? new ErrorHandler();
        this.performanceMonitor = performanceMonitorInstance ?? performanceMonitor;
        this.collection = vscode.languages.createDiagnosticCollection('thrift');
    }

    /**
     * 安排文档诊断任务（支持节流与依赖触发）。
     * @param doc 当前文档
     * @param immediate 是否立即执行
     * @param skipDependents 是否跳过依赖文件
     * @param triggerSource 触发来源
     * @param dirtyLineCount 脏行数量
     * @param includesMayChange include 是否可能变化
     * @param dirtyRange 脏范围
     * @param structuralChange 是否结构性变更
     * @param dirtyRanges 多段脏范围
     * @returns void
     */
    public scheduleAnalysis(
        doc: vscode.TextDocument,
        immediate: boolean = false,
        skipDependents: boolean = false,
        triggerSource?: string,
        dirtyLineCount?: number,
        includesMayChange?: boolean,
        dirtyRange?: LineRange,
        structuralChange?: boolean,
        dirtyRanges?: LineRange[]
    ) {
        if (doc.languageId !== 'thrift') { return; }

        const key = this.getDocumentKey(doc);
        const triggerInfo = triggerSource ? ` (triggered by ${triggerSource})` : '';
        const dirtyInfo = dirtyLineCount !== undefined ? `, dirtyLines=${dirtyLineCount}` : '';

        const useIncremental = config.incremental.analysisEnabled &&
            dirtyLineCount !== undefined &&
            dirtyLineCount <= config.incremental.maxDirtyLines &&
            !includesMayChange &&
            !structuralChange;

        if (useIncremental) {
            skipDependents = true;
        }

        logDiagnostics(`[Diagnostics] Schedule analysis for ${path.basename(doc.uri.fsPath)}, immediate=${immediate}, skipDependents=${skipDependents}${triggerInfo}${dirtyInfo}`);

        const existingTimeout = this.analysisQueue.get(key);
        if (existingTimeout) {
            clearTimeout(existingTimeout);
        }

        const state = this.documentStates.get(key);
        const now = Date.now();
        const lastGap = state?.lastAnalysis ? now - state.lastAnalysis : Number.POSITIVE_INFINITY;
        const throttleDelay = lastGap < this.MIN_ANALYSIS_INTERVAL ? this.MIN_ANALYSIS_INTERVAL - lastGap : 0;

        if (state?.isAnalyzing) { return; }
        if (state && state.version === doc.version && throttleDelay === 0) { return; }

        const baseDelay = immediate ? 0 : this.ANALYSIS_DELAY;
        const delay = Math.max(baseDelay, throttleDelay);

        const timeout = setTimeout(() => {
            this.analysisQueue.delete(key);
            this.enqueueAnalysis(doc);
        }, delay);

        this.analysisQueue.set(key, timeout);
        this.documentStates.set(key, {
            version: doc.version,
            isAnalyzing: state?.isAnalyzing ?? false,
            lastAnalysis: state?.lastAnalysis,
            dirtyLineCount,
            includesMayChange,
            useCachedIncludes: useIncremental,
            useIncrementalDiagnostics: useIncremental,
            dirtyRange: dirtyRange ? { ...dirtyRange } : undefined,
            dirtyRanges: dirtyRanges?.map(range => ({ ...range })) ?? state?.dirtyRanges,
            lastDiagnostics: state?.lastDiagnostics
        });

        if (!skipDependents) {
            const dependents = this.getDependentFiles(key);
            for (const dependentFile of dependents) {
                const dependentDoc = vscode.workspace.textDocuments.find((d) => d.uri.toString() === dependentFile);
                if (dependentDoc && dependentDoc.languageId === 'thrift') {
                    this.scheduleAnalysis(dependentDoc, false, true, 'dependency');
                }
            }
        }
    }

    /**
     * 清理文档状态与缓存。
     * @param doc 当前文档
     * @returns void
     */
    public clearDocument(doc: vscode.TextDocument) {
        const key = this.getDocumentKey(doc);

        const timeout = this.analysisQueue.get(key);
        if (timeout) {
            clearTimeout(timeout);
            this.analysisQueue.delete(key);
        }

        this.documentStates.delete(key);

        const oldIncludes = this.fileIncludes.get(key);
        if (oldIncludes) {
            for (const includedKey of oldIncludes) {
                const dependents = this.fileDependencies.get(includedKey);
                if (dependents) {
                    dependents.delete(key);
                    if (dependents.size === 0) {
                        this.fileDependencies.delete(includedKey);
                    }
                }
            }
        }
        this.fileIncludes.delete(key);

        this.collection.delete(doc.uri);

        const docUri = doc.uri.toString();
        if (clearIncludeCacheForDocument(docUri)) {
            logDiagnostics(`[Diagnostics] Cleared include cache for: ${path.basename(doc.uri.fsPath)}`);
        }
    }

    /**
     * 释放所有资源。
     * @returns void
     */
    public dispose() {
        for (const timeout of this.analysisQueue.values()) {
            clearTimeout(timeout);
        }
        this.analysisQueue.clear();
        this.documentStates.clear();
        this.fileDependencies.clear();
        this.fileIncludes.clear();
        this.collection.dispose();
    }

    /**
     * 暴露文件依赖信息给测试使用。
     * @returns 文件依赖映射
     */
    public getFileDependenciesForTesting(): Map<string, Set<string>> {
        return this.fileDependencies;
    }

    /**
     * 暴露 include 关系给测试使用。
     * @returns include 关系映射
     */
    public getFileIncludesForTesting(): Map<string, Set<string>> {
        return this.fileIncludes;
    }

    /**
     * 获取文档在缓存中的唯一 key。
     * @param doc 当前文档
     * @returns 文档 key
     */
    private getDocumentKey(doc: vscode.TextDocument): string {
        return doc.uri.toString();
    }

    /**
     * 将分析任务放入等待队列。
     * @param doc 当前文档
     * @returns void
     */
    private enqueueAnalysis(doc: vscode.TextDocument) {
        const key = this.getDocumentKey(doc);
        if (this.pendingAnalyses.has(key)) {
            return;
        }
        this.pendingAnalyses.add(key);
        const run = async () => {
            try {
                await this.waitForSlot();
                this.pendingAnalyses.delete(key);
                await this.performAnalysis(doc);
            } finally {
                this.releaseSlot();
            }
        };
        void run();
    }

    /**
     * 等待并占用分析并发槽位。
     * @returns void
     */
    private async waitForSlot() {
        if (this.inFlightAnalyses < this.MAX_CONCURRENT_ANALYSES) {
            this.inFlightAnalyses++;
            return;
        }
        await new Promise<void>((resolve) => this.analysisWaiters.push(resolve));
        this.inFlightAnalyses++;
    }

    /**
     * 释放分析并发槽位。
     * @returns void
     */
    private releaseSlot() {
        this.inFlightAnalyses = Math.max(0, this.inFlightAnalyses - 1);
        const waiter = this.analysisWaiters.shift();
        if (waiter) {
            waiter();
        }
    }

    /**
     * 记录 include 依赖关系。
     * @param doc 当前文档
     * @param includedFiles include 文件列表
     * @returns void
     */
    private trackFileDependencies(doc: vscode.TextDocument, includedFiles: vscode.Uri[]) {
        const docKey = this.getDocumentKey(doc);

        const oldIncludes = this.fileIncludes.get(docKey);
        if (oldIncludes) {
            for (const includedKey of oldIncludes) {
                const dependents = this.fileDependencies.get(includedKey);
                if (dependents) {
                    dependents.delete(docKey);
                    if (dependents.size === 0) {
                        this.fileDependencies.delete(includedKey);
                    }
                }
            }
        }

        const newIncludes = new Set<string>();
        for (const includedFile of includedFiles) {
            const includedKey = includedFile.toString();
            newIncludes.add(includedKey);

            if (!this.fileDependencies.has(includedKey)) {
                this.fileDependencies.set(includedKey, new Set<string>());
            }
            this.fileDependencies.get(includedKey)!.add(docKey);
        }

        this.fileIncludes.set(docKey, newIncludes);
    }

    /**
     * 获取依赖当前文件的其他文件。
     * @param fileKey 当前文件 key
     * @returns 依赖文件列表
     */
    private getDependentFiles(fileKey: string): string[] {
        const dependents = this.fileDependencies.get(fileKey);
        return dependents ? Array.from(dependents) : [];
    }

    /**
     * 执行单个文档的诊断分析。
     * @param doc 当前文档
     * @returns void
     */
    private async performAnalysis(doc: vscode.TextDocument) {
        const key = this.getDocumentKey(doc);
        logDiagnostics(`[Diagnostics] Starting analysis for ${path.basename(doc.uri.fsPath)}`);

        const state = this.documentStates.get(key) || { version: doc.version, isAnalyzing: false };
        state.isAnalyzing = true;
        state.version = doc.version;
        this.documentStates.set(key, state);

        try {
            await this.performanceMonitor.measureAsync(
                'Thrift诊断分析',
                async () => {
                    try {
                        const includedFiles = await getIncludedFiles(doc);
                        const cachedIncludedTypes = state.useCachedIncludes
                            ? collectIncludedTypesFromCache(includedFiles)
                            : null;
                        const includedTypes = cachedIncludedTypes
                            ? cachedIncludedTypes
                            : await collectIncludedTypes(doc, this.errorHandler, logDiagnostics);

                        if (!cachedIncludedTypes) {
                            this.trackFileDependencies(doc, includedFiles);
                        }

                        const text = doc.getText();
                        const lines = text.split('\n');
                        let issues: ThriftIssue[] = [];
                        let usedPartial = false;
                        let blockRange: LineRange | null = null;
                        let memberRange: LineRange | null = null;

                        if (state.useIncrementalDiagnostics && state.dirtyRange && state.lastAst && state.lastAnalysisContext) {
                            const changeRanges = state.dirtyRanges?.length
                                ? state.dirtyRanges
                                : [state.dirtyRange];
                            blockRange = findBestContainingRangeForChanges(state.lastAst, changeRanges);
                            if (blockRange) {
                                const blockKey = `${blockRange.startLine}-${blockRange.endLine}`;
                                const blockLines = lines.slice(blockRange.startLine, blockRange.endLine + 1).join('\n');
                                const blockHash = hashText(blockLines);
                                const cachedBlock = state.lastBlockCache?.get(blockKey);
                                if (cachedBlock && cachedBlock.hash === blockHash) {
                                    issues = cachedBlock.issues;
                                    memberRange = findBestContainingMemberRangeForChanges(state.lastAst, changeRanges);
                                } else {
                                    let memberCacheHit = false;
                                    const partialLines = buildPartialLines(lines, blockRange.startLine, blockRange.endLine);
                                    const partialText = partialLines.join('\n');
                                    const partialKey = `${doc.uri.toString()}#partial:${blockRange.startLine}-${blockRange.endLine}`;
                                    const partialAst = ThriftParser.parseContentWithCache(partialKey, partialText);
                                    memberRange = findBestContainingMemberRangeForChanges(partialAst, changeRanges);
                                    const memberKey = memberRange ? `${memberRange.startLine}-${memberRange.endLine}` : null;
                                    const memberHash = memberRange
                                        ? hashText(partialLines.slice(memberRange.startLine, memberRange.endLine + 1).join('\n'))
                                        : null;
                                    const cachedMember = memberKey
                                        ? state.lastMemberCache?.get(blockKey)?.get(memberKey)
                                        : null;

                                    if (cachedMember && cachedMember.hash === memberHash) {
                                        issues = cachedMember.issues;
                                        memberCacheHit = true;
                                    } else {
                                        issues = analyzeThriftAst(
                                            partialAst,
                                            partialLines,
                                            includedTypes,
                                            state.lastAnalysisContext,
                                            memberRange ?? undefined
                                        );
                                    }
                                    if (!memberCacheHit) {
                                        if (!state.lastBlockCache) {
                                            state.lastBlockCache = createBlockCache();
                                        }
                                        const blockIssues = issues.filter(issue => rangeIntersectsLineRange(issue.range, blockRange!));
                                        state.lastBlockCache.set(blockKey, { hash: blockHash, issues: blockIssues });
                                        if (!state.lastMemberCache) {
                                            state.lastMemberCache = createMemberCacheByBlock();
                                        }
                                        const blockNode = findContainingNode(partialAst, blockRange);
                                        if (blockNode) {
                                            state.lastMemberCache.set(blockKey, buildMemberCacheForNode(blockNode, partialLines, issues));
                                        }
                                    } else if (memberKey && memberRange && memberHash !== null) {
                                        if (!state.lastMemberCache) {
                                            state.lastMemberCache = createMemberCacheByBlock();
                                        }
                                        const blockMembers = state.lastMemberCache.get(blockKey) ?? createMemberCache();
                                        blockMembers.set(memberKey, { range: memberRange, hash: memberHash, issues });
                                        state.lastMemberCache.set(blockKey, blockMembers);
                                    }
                                }
                                usedPartial = true;
                            }
                        }

                        if (!usedPartial) {
                            const ast = ThriftParser.parseContentWithCache(doc.uri.toString(), text);
                            issues = analyzeThriftAst(ast, lines, includedTypes);
                            state.lastAst = ast;
                            state.lastAnalysisContext = buildAnalysisContext(ast);
                            state.lastBlockCache = buildBlockCache(ast, lines, issues);
                            state.lastMemberCache = buildMemberCache(ast, lines, issues);
                        }

                        const mergeRange = memberRange ?? blockRange;
                        if (usedPartial && mergeRange) {
                            issues = issues.filter(issue => rangeIntersectsLineRange(issue.range, mergeRange));
                        }

                        const mergeState = usedPartial && mergeRange
                            ? { ...state, dirtyRange: mergeRange }
                            : usedPartial
                                ? state
                            : { ...state, useIncrementalDiagnostics: false };
                        const incrementalDiagnostics = this.mergeIncrementalDiagnostics(
                            issues,
                            mergeState,
                            doc
                        );
                        const diagnostics = incrementalDiagnostics
                            ? incrementalDiagnostics
                            : issues.map(i => new vscode.Diagnostic(i.range, i.message, i.severity));

                        this.collection.set(doc.uri, diagnostics);
                        state.lastDiagnostics = diagnostics;

                        logDiagnostics(`文档 ${path.basename(doc.uri.fsPath)} 分析完成: ${diagnostics.length} 个问题`);
                    } catch (error) {
                        this.errorHandler.handleError(error, {
                            component: 'DiagnosticManager',
                            operation: 'analyzeDocument',
                            filePath: doc.uri.fsPath,
                            additionalInfo: { documentVersion: doc.version }
                        });
                        this.collection.set(doc.uri, []);
                    }
                },
                doc
            );
        } finally {
            state.isAnalyzing = false;
            state.lastAnalysis = Date.now();
            this.documentStates.set(key, state);
        }
    }

    /**
     * 合并增量诊断结果到上一次诊断集中。
     * @param issues 当前分析的诊断问题
     * @param state 增量合并状态
     * @param doc 当前文档
     * @returns 合并后的诊断结果或 null
     */
    private mergeIncrementalDiagnostics(
        issues: ThriftIssue[],
        state: {
            useIncrementalDiagnostics?: boolean;
            dirtyRange?: LineRange;
            lastDiagnostics?: vscode.Diagnostic[];
        },
        doc: vscode.TextDocument
    ): vscode.Diagnostic[] | null {
        if (!state.useIncrementalDiagnostics || !state.dirtyRange || !state.lastDiagnostics) {
            return null;
        }

        const lineRange = normalizeLineRange(state.dirtyRange);
        if (!lineRange) {
            return null;
        }

        const nextDiagnostics = issues
            .filter(issue => rangeIntersectsLineRange(issue.range, lineRange))
            .map(issue => new vscode.Diagnostic(issue.range, issue.message, issue.severity));

        const preserved = state.lastDiagnostics.filter(diagnostic => !rangeIntersectsLineRange(diagnostic.range, lineRange));
        const merged = [...preserved, ...nextDiagnostics];

        logDiagnostics(`[Diagnostics] Incremental merge applied for ${path.basename(doc.uri.fsPath)} (lines ${lineRange.startLine}-${lineRange.endLine})`);

        return merged;
    }
}

/**
 * 创建块级诊断缓存。
 * @returns 块级缓存实例
 */
function createBlockCache(): BlockCache {
    return new LruCache<string, BlockCacheValue>(
        config.cache.diagnosticsBlocks.maxSize,
        config.cache.diagnosticsBlocks.ttlMs
    );
}

/**
 * 创建成员缓存的分块容器。
 * @returns 成员分块缓存实例
 */
function createMemberCacheByBlock(): MemberCacheByBlock {
    return new LruCache<string, MemberCache>(
        config.cache.diagnosticsBlocks.maxSize,
        config.cache.diagnosticsBlocks.ttlMs
    );
}

/**
 * 创建成员级缓存。
 * @returns 成员缓存实例
 */
function createMemberCache(): MemberCache {
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
 * @returns 成员缓存
 */
function buildMemberCache(ast: nodes.ThriftDocument, lines: string[], issues: ThriftIssue[]) {
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
function buildMemberCacheForNode(
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
        const memberIssues = issues.filter(issue => rangeIntersectsLineRange(issue.range, { startLine, endLine }));
        const key = `${startLine}-${endLine}`;
        cache.set(key, {
            range: { startLine, endLine },
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
function buildBlockCache(ast: nodes.ThriftDocument, lines: string[], issues: ThriftIssue[]) {
    const cache = createBlockCache();
    for (const node of ast.body) {
        const startLine = node.range.start.line;
        const endLine = node.range.end.line;
        const key = `${startLine}-${endLine}`;
        const blockText = lines.slice(startLine, endLine + 1).join('\n');
        const blockIssues = issues.filter(issue => rangeIntersectsLineRange(issue.range, { startLine, endLine }));
        cache.set(key, { hash: hashText(blockText), issues: blockIssues });
    }
    return cache;
}
