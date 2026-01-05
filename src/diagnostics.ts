import * as vscode from 'vscode';
import * as path from 'path';
import { PerformanceMonitor, performanceMonitor } from './performance-monitor';
import * as nodes from './ast/nodes.types';
import { ThriftFileWatcher } from './utils/file-watcher';
import { ErrorHandler } from './utils/error-handler';
import { config } from './config';
import { LruCache } from './utils/lru-cache';
import { CoreDependencies } from './utils/dependencies';
import {
    LineRange,
    collapseLineRanges,
    lineRangeFromChange,
    mergeLineRanges,
    normalizeLineRange,
    rangeContainsLineRange,
    rangeIntersectsLineRange
} from './utils/line-range';
import {
    diagnosticsTestUtils,
    findBestContainingMemberRange,
    findBestContainingMemberRangeForChanges,
    findBestContainingRange,
    findBestContainingRangeForChanges,
    findContainingNode,
    hasStructuralTokens,
    includesKeyword,
    stripCommentsFromLine,
    buildPartialLines,
    hashText
} from './diagnostics/utils';
import {
    clearIncludeCacheForDocument,
    clearIncludeCaches,
    collectIncludedTypes,
    collectIncludedTypesFromCache,
    getIncludedFiles
} from './diagnostics/include-resolver';
import {
    AnalysisContext,
    analyzeThriftAst,
    analyzeThriftText,
    buildAnalysisContext
} from './diagnostics/rules';
import type {
    BlockCache,
    BlockCacheValue,
    MemberCache,
    MemberCacheByBlock,
    MemberCacheValue,
    ThriftIssue
} from './diagnostics/types';

export type { ThriftIssue } from './diagnostics/types';
export { diagnosticsTestUtils } from './diagnostics/utils';
export { analyzeThriftText } from './diagnostics/rules';

function isDiagnosticsDebugEnabled(): boolean {
    try {
        return !!vscode.workspace.getConfiguration('thrift').get('diagnostics.debug', false);
    } catch {
        return false;
    }
}

function logDiagnostics(message: string) {
    if (!isDiagnosticsDebugEnabled()) {
        return;
    }
    console.log(message);
}

/**
 * DiagnosticManager：负责诊断调度、缓存与依赖跟踪。
 */
export class DiagnosticManager {
    private collection: vscode.DiagnosticCollection;
    private analysisQueue = new Map<string, NodeJS.Timeout>();
    private documentStates = new Map<string, {
        version: number;
        isAnalyzing: boolean;
        lastAnalysis?: number;
        dirtyLineCount?: number;
        includesMayChange?: boolean;
        useCachedIncludes?: boolean;
        useIncrementalDiagnostics?: boolean;
        dirtyRange?: LineRange;
        dirtyRanges?: LineRange[];
        lastDiagnostics?: vscode.Diagnostic[];
        lastAst?: nodes.ThriftDocument;
        lastAnalysisContext?: AnalysisContext;
        lastBlockCache?: BlockCache;
        lastMemberCache?: MemberCacheByBlock;
    }>();
    private readonly ANALYSIS_DELAY = config.diagnostics.analysisDelayMs;
    private readonly MIN_ANALYSIS_INTERVAL = config.diagnostics.minAnalysisIntervalMs;
    private readonly MAX_CONCURRENT_ANALYSES = Math.max(1, config.diagnostics.maxConcurrentAnalyses);
    private inFlightAnalyses = 0;
    private analysisWaiters: Array<() => void> = [];
    private pendingAnalyses = new Set<string>();

    // 文件依赖跟踪 - key: 文件路径, value: 依赖该文件的其他文件路径集合
    private fileDependencies = new Map<string, Set<string>>();
    // 反向依赖跟踪 - key: 文件路径, value: 该文件包含的其他文件路径集合
    private fileIncludes = new Map<string, Set<string>>();
    private errorHandler: ErrorHandler;
    private performanceMonitor: PerformanceMonitor;

    constructor(errorHandler?: ErrorHandler, performanceMonitorInstance?: PerformanceMonitor) {
        this.errorHandler = errorHandler ?? new ErrorHandler();
        this.performanceMonitor = performanceMonitorInstance ?? performanceMonitor;
        this.collection = vscode.languages.createDiagnosticCollection('thrift');
    }

    /**
     * 安排文档诊断任务（支持节流与依赖触发）。
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

        // 增量模式：小改动时避免触发依赖文件连锁分析
        if (useIncremental) {
            skipDependents = true;
        }

        logDiagnostics(`[Diagnostics] Schedule analysis for ${path.basename(doc.uri.fsPath)}, immediate=${immediate}, skipDependents=${skipDependents}${triggerInfo}${dirtyInfo}`);

        // 清除之前的分析队列
        const existingTimeout = this.analysisQueue.get(key);
        if (existingTimeout) {
            clearTimeout(existingTimeout);
        }

        const state = this.documentStates.get(key);
        const now = Date.now();
        const lastGap = state?.lastAnalysis ? now - state.lastAnalysis : Number.POSITIVE_INFINITY;
        const throttleDelay = lastGap < this.MIN_ANALYSIS_INTERVAL ? this.MIN_ANALYSIS_INTERVAL - lastGap : 0;

        // 若正在分析则跳过
        if (state?.isAnalyzing) { return; }
        // 同一版本且无需节流等待，则不重复分析
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

        // 如果需要分析依赖文件，延迟分析它们（避免连锁反应）
        if (!skipDependents) {
            const dependentFiles = this.getDependentFiles(key);
            if (dependentFiles.length > 0) {
                logDiagnostics(`[Diagnostics] File ${path.basename(doc.uri.fsPath)} changed, scheduling analysis for ${dependentFiles.length} dependent files${triggerInfo}`);

                // 延迟分析依赖文件，避免立即连锁反应
                setTimeout(() => {
                    for (const dependentKey of dependentFiles) {
                        const dependentDoc = vscode.workspace.textDocuments.find(d => this.getDocumentKey(d) === dependentKey);
                        if (dependentDoc && dependentDoc.languageId === 'thrift') {
                            logDiagnostics(`[Diagnostics] Scheduling analysis for dependent file: ${path.basename(dependentDoc.uri.fsPath)} (triggered by dependency change)`);
                            // 使用 skipDependents=true 避免递归分析
                            this.scheduleAnalysis(dependentDoc, false, true, 'dependency');
                        }
                    }
                }, this.ANALYSIS_DELAY * config.diagnostics.dependentAnalysisDelayFactor);
            }
        }
    }

    private enqueueAnalysis(doc: vscode.TextDocument): void {
        const key = this.getDocumentKey(doc);
        if (this.pendingAnalyses.has(key)) {
            return;
        }
        this.pendingAnalyses.add(key);
        void this.runWithLimit(async () => {
            try {
                await this.performAnalysis(doc);
            } finally {
                this.pendingAnalyses.delete(key);
            }
        });
    }

    private async runWithLimit<T>(task: () => Promise<T>): Promise<T> {
        if (this.MAX_CONCURRENT_ANALYSES <= 0) {
            return task();
        }
        await this.acquireSlot();
        try {
            return await task();
        } finally {
            this.releaseSlot();
        }
    }

    private acquireSlot(): Promise<void> {
        if (this.inFlightAnalyses < this.MAX_CONCURRENT_ANALYSES) {
            this.inFlightAnalyses += 1;
            return Promise.resolve();
        }
        return new Promise(resolve => {
            this.analysisWaiters.push(() => {
                this.inFlightAnalyses += 1;
                resolve();
            });
        });
    }

    private releaseSlot(): void {
        this.inFlightAnalyses = Math.max(0, this.inFlightAnalyses - 1);
        const next = this.analysisWaiters.shift();
        if (next) {
            next();
        }
    }

    /**
     * 清理指定文档的诊断与缓存。
     */
    public clearDocument(doc: vscode.TextDocument) {
        const key = this.getDocumentKey(doc);

        // 清除分析队列
        const timeout = this.analysisQueue.get(key);
        if (timeout) {
            clearTimeout(timeout);
            this.analysisQueue.delete(key);
        }

        // 清除状态
        this.documentStates.delete(key);

        // 清除依赖关系
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

        // 清除诊断信息
        this.collection.delete(doc.uri);

        // 清除包含文件缓存（如果这个文件是被包含的文件）
        const docUri = doc.uri.toString();
        if (clearIncludeCacheForDocument(docUri)) {
            logDiagnostics(`[Diagnostics] Cleared include cache for: ${path.basename(doc.uri.fsPath)}`);
        }
    }

    /**
     * 释放所有资源。
     */
    public dispose() {
        // 清除所有待处理的分析
        for (const timeout of this.analysisQueue.values()) {
            clearTimeout(timeout);
        }
        this.analysisQueue.clear();
        this.documentStates.clear();
        this.fileDependencies.clear();
        this.fileIncludes.clear();
        this.collection.dispose();
    }

    // Testing methods to expose internal state for unit tests
    public getFileDependenciesForTesting(): Map<string, Set<string>> {
        return this.fileDependencies;
    }

    public getFileIncludesForTesting(): Map<string, Set<string>> {
        return this.fileIncludes;
    }

    private getDocumentKey(doc: vscode.TextDocument): string {
        return doc.uri.toString();
    }

    // 跟踪文件依赖关系
    private trackFileDependencies(document: vscode.TextDocument, includedFiles: vscode.Uri[]) {
        const docKey = this.getDocumentKey(document);

        // 清除旧的依赖关系
        const oldIncludes = this.fileIncludes.get(docKey);
        if (oldIncludes) {
            // 从其他文件的依赖列表中移除当前文件
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

        // 建立新的依赖关系
        const newIncludes = new Set<string>();
        for (const includedFile of includedFiles) {
            const includedKey = includedFile.toString();
            newIncludes.add(includedKey);

            // 添加到依赖映射
            if (!this.fileDependencies.has(includedKey)) {
                this.fileDependencies.set(includedKey, new Set<string>());
            }
            this.fileDependencies.get(includedKey)!.add(docKey);
        }

        // 更新包含映射
        this.fileIncludes.set(docKey, newIncludes);
    }

    // 获取依赖指定文件的所有文件
    private getDependentFiles(fileKey: string): string[] {
        const dependents = this.fileDependencies.get(fileKey);
        return dependents ? Array.from(dependents) : [];
    }

    private async performAnalysis(doc: vscode.TextDocument) {
        const key = this.getDocumentKey(doc);
        logDiagnostics(`[Diagnostics] Starting analysis for ${path.basename(doc.uri.fsPath)}`);

        // 更新状态
        const state = this.documentStates.get(key) || { version: doc.version, isAnalyzing: false };
        state.isAnalyzing = true;
        state.version = doc.version;
        this.documentStates.set(key, state);

        try {
            // 使用性能监控包装分析过程
            await this.performanceMonitor.measureAsync(
                'Thrift诊断分析',
                async () => {
                    try {
                        // Collect types from included files
                        const includedFiles = await getIncludedFiles(doc);
                        const cachedIncludedTypes = state.useCachedIncludes
                            ? collectIncludedTypesFromCache(includedFiles)
                            : null;
                        const includedTypes = cachedIncludedTypes
                            ? cachedIncludedTypes
                            : await collectIncludedTypes(doc, this.errorHandler, logDiagnostics);

                        // 跟踪文件依赖关系（缓存命中时可跳过）
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

                        // 原子性更新诊断信息
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
                        // 出错时清空诊断信息，避免显示过时错误
                        this.collection.set(doc.uri, []);
                    }
                },
                doc
            );
        } finally {
            // 更新状态
            state.isAnalyzing = false;
            state.lastAnalysis = Date.now();
            this.documentStates.set(key, state);
        }
    }

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

function createBlockCache(): BlockCache {
    return new LruCache<string, BlockCacheValue>(
        config.cache.diagnosticsBlocks.maxSize,
        config.cache.diagnosticsBlocks.ttlMs
    );
}

function createMemberCacheByBlock(): MemberCacheByBlock {
    return new LruCache<string, MemberCache>(
        config.cache.diagnosticsBlocks.maxSize,
        config.cache.diagnosticsBlocks.ttlMs
    );
}

function createMemberCache(): MemberCache {
    return new LruCache<string, MemberCacheValue>(
        config.cache.diagnosticsMembers.maxSize,
        config.cache.diagnosticsMembers.ttlMs
    );
}

function buildMemberCache(ast: nodes.ThriftDocument, lines: string[], issues: ThriftIssue[]) {
    const cache = createMemberCacheByBlock();
    for (const node of ast.body) {
        const blockKey = `${node.range.start.line}-${node.range.end.line}`;
        cache.set(blockKey, buildMemberCacheForNode(node, lines, issues));
    }
    return cache;
}

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

/**
 * 注册诊断管理器和相关事件监听器
 * @param context vscode 扩展上下文
 */
/**
 * 注册诊断能力与文件监听。
 */
export function registerDiagnostics(context: vscode.ExtensionContext, deps?: Partial<CoreDependencies>) {
    const diagnosticManager = new DiagnosticManager(deps?.errorHandler, deps?.performanceMonitor);

    // 使用 ThriftFileWatcher 监控.thrift文件变化
    const fileWatcher = deps?.fileWatcher ?? new ThriftFileWatcher();

    const diagnosticsFileWatcher = fileWatcher.createWatcher(config.filePatterns.thrift, () => {
        // 当有任何.thrift文件变化时，清除相关缓存并重新分析
        logDiagnostics(`[Diagnostics] File system watcher triggered, clearing caches and rescheduling analysis`);

        // 清除所有包含缓存
        clearIncludeCaches();

        // 重新分析所有打开的thrift文档
        vscode.workspace.textDocuments.forEach(doc => {
            if (doc.languageId === 'thrift') {
                diagnosticManager.scheduleAnalysis(doc, false, false, 'fileSystemChange');
            }
        });
    });

    context.subscriptions.push(diagnosticsFileWatcher);

    // 注册事件监听器
    context.subscriptions.push(
        // 文档打开时立即分析
        vscode.workspace.onDidOpenTextDocument(doc => {
            if (doc.languageId === 'thrift') {
                diagnosticManager.scheduleAnalysis(doc, true, false, 'documentOpen');
            }
        }),

        // 文档内容变更时延迟分析
        vscode.workspace.onDidChangeTextDocument(e => {
            if (e.document.languageId === 'thrift') {
                let dirtyLines: number | undefined;
                let includesMayChange = false;
                let dirtyRange: LineRange | undefined;
                const dirtyRanges: LineRange[] = [];
                let mergedDirtyRanges: LineRange[] | undefined;
                let structuralChange = false;
                if (config.incremental.analysisEnabled) {
                    dirtyLines = e.contentChanges.reduce((acc, change) => {
                        const affected = change.text.split('\n').length - 1;
                        const removed = change.range.end.line - change.range.start.line;
                        return acc + Math.max(affected, removed);
                    }, 0);
                    includesMayChange = e.contentChanges.some(change => {
                        if (includesKeyword(change.text)) {
                            return true;
                        }
                        try {
                            const lineText = e.document.lineAt(change.range.start.line).text;
                            return includesKeyword(lineText);
                        } catch {
                            return false;
                        }
                    });
                    for (const change of e.contentChanges) {
                        const startLine = change.range.start.line;
                        const endLine = change.range.end.line;
                        dirtyRanges.push(lineRangeFromChange(change));

                        if (startLine !== endLine || change.text.includes('\n')) {
                            structuralChange = true;
                            continue;
                        }

                        if (hasStructuralTokens(change.text)) {
                            structuralChange = true;
                            continue;
                        }

                        try {
                            const lineText = e.document.lineAt(change.range.start.line).text;
                            if (hasStructuralTokens(lineText)) {
                                structuralChange = true;
                            }
                        } catch {
                            structuralChange = true;
                        }
                    }
                    mergedDirtyRanges = mergeLineRanges(dirtyRanges);
                    dirtyRange = collapseLineRanges(mergedDirtyRanges) ?? undefined;
                }
                diagnosticManager.scheduleAnalysis(
                    e.document,
                    false,
                    false,
                    'documentChange',
                    dirtyLines,
                    includesMayChange,
                    dirtyRange,
                    structuralChange,
                    mergedDirtyRanges
                );
            }
        }),

        // 文档保存时立即分析（确保显示最新状态）
        vscode.workspace.onDidSaveTextDocument(doc => {
            if (doc.languageId === 'thrift') {
                diagnosticManager.scheduleAnalysis(doc, true, false, 'documentSave');
            }
        }),

        // 文档关闭时清理
        vscode.workspace.onDidCloseTextDocument(doc => {
            if (doc.languageId === 'thrift') {
                diagnosticManager.clearDocument(doc);
            }
        }),

        // 监听文档激活事件 - 这可能是点击文件时触发扫描的原因
        vscode.window.onDidChangeActiveTextEditor(editor => {
            if (editor && editor.document.languageId === 'thrift') {
                logDiagnostics(`[Diagnostics] Active text editor changed to: ${path.basename(editor.document.uri.fsPath)}`);
                // 延迟分析，避免立即触发
                setTimeout(() => {
                    diagnosticManager.scheduleAnalysis(editor.document, false, false, 'documentActivate');
                }, 500);
            }
        }),

        // 扩展卸载时清理
        diagnosticManager
    );

    // 初始分析活动文档
    if (vscode.window.activeTextEditor && vscode.window.activeTextEditor.document.languageId === 'thrift') {
        diagnosticManager.scheduleAnalysis(vscode.window.activeTextEditor.document, true, false, 'extensionActivate');
    }
}
