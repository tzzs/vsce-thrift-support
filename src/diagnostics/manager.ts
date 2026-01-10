import * as path from 'path';
import * as vscode from 'vscode';
import {ThriftParser} from '../ast/parser';
import {config} from '../config';
import {ErrorHandler} from '../utils/error-handler';
import {LineRange, normalizeLineRange, rangeIntersectsLineRange} from '../utils/line-range';
import {PerformanceMonitor, performanceMonitor} from '../performance-monitor';
import {ThriftIssue} from './types';
import {logDiagnostics} from './logger';
import {
    buildBlockCache,
    buildMemberCache,
    buildMemberCacheForNode,
    createBlockCache,
    createMemberCache,
    createMemberCacheByBlock
} from './analysis-cache';
import {DocumentDiagnosticState, mergeBlockIntoAst} from './state';
import {collectIncludedTypes, collectIncludedTypesFromCache, getIncludedFiles} from './include-resolver';
import {analyzeThriftAst, buildAnalysisContext} from './rules';
import {
    buildPartialLines,
    findBestContainingMemberRangeForChanges,
    findBestContainingRangeForChanges,
    findContainingNode,
    hashText
} from './utils';
import {DependencyManager} from './dependency-manager';
import {AnalysisScheduler} from './scheduler';

/**
 * DiagnosticManager：负责诊断调度、缓存与依赖跟踪。
 */
export class DiagnosticManager {
    /** VS Code 诊断集合 */
    private collection: vscode.DiagnosticCollection;
    /** 文档诊断状态缓存 */
    private documentStates = new Map<string, DocumentDiagnosticState>();

    private dependencyManager: DependencyManager;
    private scheduler: AnalysisScheduler;
    private errorHandler: ErrorHandler;
    private performanceMonitor: PerformanceMonitor;

    constructor(errorHandler?: ErrorHandler, performanceMonitorInstance?: PerformanceMonitor) {
        this.errorHandler = errorHandler ?? new ErrorHandler();
        this.performanceMonitor = performanceMonitorInstance ?? performanceMonitor;
        this.collection = vscode.languages.createDiagnosticCollection('thrift');
        this.dependencyManager = new DependencyManager();
        this.scheduler = new AnalysisScheduler();
    }

    /**
     * 安排文档诊断任务（支持节流与依赖触发）。
     * @param doc 目标文档
     * @param immediate 是否立即执行（跳过节流延迟）
     * @param skipDependents 是否跳过依赖文件分析（避免循环触发）
     * @param triggerSource 触发源标识（日志用）
     * @param dirtyLineCount 变更行数（用于增量决策）
     * @param includesMayChange include 是否可能变更
     * @param dirtyRange 变更范围（增量分析用）
     * @param structuralChange 是否为结构性变更
     * @param dirtyRanges 多段变更范围
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
        if (doc.languageId !== 'thrift') {
            return;
        }

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

        const prevState = this.documentStates.get(key);

        const scheduled = this.scheduler.schedule(
            doc,
            {
                immediate,
                throttleState: prevState
            },
            () => this.performAnalysis(doc),
            (timeout: NodeJS.Timeout) => {
                // Keep track if needed, but scheduler handles queue
            }
        );

        if (!scheduled && !prevState?.isAnalyzing) {
            // Maybe explicitly skipped due to throttling without new changes?
            // But we need to update state if parameters changed? 
            // Actually scheduler logic handles throttling check. 
            // We persist state update regardless to capture latest intentions.
        }

        // Update state to reflect pending analysis parameters
        const nextState: DocumentDiagnosticState = {
            ...(prevState ?? {}),
            version: doc.version,
            isAnalyzing: prevState?.isAnalyzing ?? false, // Don't flip here, scheduler flips when running
            lastAnalysis: prevState?.lastAnalysis,
            dirtyLineCount,
            includesMayChange,
            useCachedIncludes: useIncremental,
            useIncrementalDiagnostics: useIncremental,
            dirtyRange: dirtyRange ? {...dirtyRange} : undefined,
            dirtyRanges: dirtyRanges?.map(range => ({...range})) ?? prevState?.dirtyRanges,
            lastDiagnostics: prevState?.lastDiagnostics
        };
        this.documentStates.set(key, nextState);

        if (scheduled && !skipDependents) {
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
     * @param doc 目标文档
     */
    public clearDocument(doc: vscode.TextDocument) {
        const key = this.getDocumentKey(doc);
        this.scheduler.cancel(doc);
        this.dependencyManager.clearDocument(doc);
        this.documentStates.delete(key);
        this.collection.delete(doc.uri);
    }

    /**
     * 释放所有资源。
     */
    public dispose() {
        this.scheduler.dispose();
        this.dependencyManager.dispose();
        this.documentStates.clear();
        this.collection.dispose();
    }

    /**
     * 暴露文件依赖信息给测试使用。
     * @returns 依赖关系映射表
     */
    public getFileDependenciesForTesting(): Map<string, Set<string>> {
        return this.dependencyManager.getFileDependenciesForTesting();
    }

    /**
     * 暴露 include 关系给测试使用。
     * @returns Include 关系映射表
     */
    public getFileIncludesForTesting(): Map<string, Set<string>> {
        return this.dependencyManager.getFileIncludesForTesting();
    }

    private getDocumentKey(doc: vscode.TextDocument): string {
        return doc.uri.toString();
    }

    private getDependentFiles(fileKey: string): string[] {
        return this.dependencyManager.getDependentFiles(fileKey);
    }

    /**
     * 执行单个文档的诊断分析。
     */
    private async performAnalysis(doc: vscode.TextDocument) {
        const key = this.getDocumentKey(doc);
        logDiagnostics(`[Diagnostics] Starting analysis for ${path.basename(doc.uri.fsPath)}`);

        const state = this.documentStates.get(key) || {version: doc.version, isAnalyzing: false};
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
                            this.dependencyManager.trackFileDependencies(doc, includedFiles);
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
                                    const blockNode = findContainingNode(partialAst, blockRange);
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
                                        state.lastBlockCache.set(blockKey, {hash: blockHash, issues: blockIssues});
                                        if (!state.lastMemberCache) {
                                            state.lastMemberCache = createMemberCacheByBlock();
                                        }
                                        if (blockNode) {
                                            state.lastMemberCache.set(blockKey, buildMemberCacheForNode(blockNode, partialLines, issues));
                                        }
                                    } else if (memberKey && memberRange && memberHash !== null) {
                                        if (!state.lastMemberCache) {
                                            state.lastMemberCache = createMemberCacheByBlock();
                                        }
                                        const blockMembers = state.lastMemberCache.get(blockKey) ?? createMemberCache();
                                        blockMembers.set(memberKey, {range: memberRange, hash: memberHash, issues});
                                        state.lastMemberCache.set(blockKey, blockMembers);
                                    }

                                    if (blockNode && state.lastAst) {
                                        mergeBlockIntoAst(state.lastAst, blockNode, blockRange);
                                        state.blockAstCache = state.blockAstCache ?? new Map();
                                        state.blockAstCache.set(blockKey, {hash: blockHash, node: blockNode});
                                        state.lastAnalysisContext = buildAnalysisContext(state.lastAst);
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
                            state.blockAstCache = new Map();
                        }

                        const mergeRange = memberRange ?? blockRange;
                        if (usedPartial && mergeRange) {
                            issues = issues.filter(issue => rangeIntersectsLineRange(issue.range, mergeRange));
                        }

                        const mergeState = usedPartial && mergeRange
                            ? {...state, dirtyRange: mergeRange}
                            : usedPartial
                                ? state
                                : {...state, useIncrementalDiagnostics: false};
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
                            additionalInfo: {documentVersion: doc.version}
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
