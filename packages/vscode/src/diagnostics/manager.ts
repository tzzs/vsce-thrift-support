import * as path from 'path';
import * as vscode from 'vscode';
import {ThriftParser} from '@tanzz/thrift-core'; // This now exports OptimizedThriftParser
import {config} from '@tanzz/thrift-core';
import {ErrorHandler} from '@tanzz/thrift-core';
import {LineRange, normalizeLineRange, rangeIntersectsLineRange} from '../utils/line-range';
import {toVscodeRange} from '../utils/vscode-utils';
import {makeLineRangeKey} from '@tanzz/thrift-core';
import {PerformanceMonitor, performanceMonitor} from '../performance-monitor';
import {ThriftIssue} from '@tanzz/thrift-core';
import type {DiagnosticsRuleOptions} from '@tanzz/thrift-core';
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
} from '@tanzz/thrift-core';
import {DependencyManager} from './dependency-manager';
import {AnalysisScheduler} from './scheduler';
import {WorkspaceIndex} from '../indexing/workspace-index';

export type WorkspaceDiagnosticsMode = 'openFiles' | 'workspace' | 'off';

export interface DiagnosticsStatus {
    workspaceMode: WorkspaceDiagnosticsMode;
    indexedFileCount: number;
    filesWithDiagnostics: number;
    lastScanDurationMs: number;
    topRuleIds: Array<{ruleId: string; count: number}>;
    isScanning: boolean;
}

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
    private readonly workspaceIndex?: WorkspaceIndex;
    private workspaceScanTimeout: NodeJS.Timeout | undefined;
    private workspaceScanGeneration = 0;
    private status: DiagnosticsStatus = {
        workspaceMode: 'openFiles',
        indexedFileCount: 0,
        filesWithDiagnostics: 0,
        lastScanDurationMs: 0,
        topRuleIds: [],
        isScanning: false
    };

    constructor(errorHandler?: ErrorHandler, performanceMonitorInstance?: PerformanceMonitor, workspaceIndex?: WorkspaceIndex) {
        this.errorHandler = errorHandler ?? new ErrorHandler();
        this.performanceMonitor = performanceMonitorInstance ?? performanceMonitor;
        this.workspaceIndex = workspaceIndex;
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
        immediate = false,
        skipDependents = false,
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
        if (this.getWorkspaceMode() === 'off') {
            this.collection.clear();
            this.status.workspaceMode = 'off';
            return;
        }

        const key = this.getDocumentKey(doc);
        const triggerInfo = typeof triggerSource === 'string' && triggerSource.length > 0 ? ` (triggered by ${triggerSource})` : '';
        const dirtyInfo = dirtyLineCount !== undefined ? `, dirtyLines=${dirtyLineCount}` : '';

        const useIncremental = config.incremental.analysisEnabled &&
            dirtyLineCount !== undefined &&
            dirtyLineCount <= config.incremental.maxDirtyLines &&
            includesMayChange !== true &&
            structuralChange !== true;

        if (useIncremental) {
            skipDependents = true;
        }

        logDiagnostics(`[Diagnostics] Schedule analysis for ${path.basename(doc.uri.fsPath)}, immediate=${String(immediate)}, skipDependents=${String(skipDependents)}${triggerInfo}${dirtyInfo}`);

        const prevState = this.documentStates.get(key);

        const scheduled = this.scheduler.schedule(
            doc,
            {
                immediate,
                throttleState: prevState
            },
            () => {
                void this.performAnalysis(doc);
            },
            (timeout: NodeJS.Timeout) => {
                void timeout;
                // Keep track if needed, but scheduler handles queue
            }
        );

        if (!scheduled && prevState?.isAnalyzing !== true) {
            void 0;
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
        if (this.workspaceScanTimeout !== undefined) {
            clearTimeout(this.workspaceScanTimeout);
            this.workspaceScanTimeout = undefined;
        }
        this.workspaceScanGeneration++;
        this.scheduler.dispose();
        this.dependencyManager.dispose();
        this.documentStates.clear();
        this.collection.dispose();
    }

    public scheduleWorkspaceScan(triggerSource = 'workspace', delayMs = 250): void {
        if (this.getWorkspaceMode() !== 'workspace') {
            return;
        }
        if (this.workspaceScanTimeout !== undefined) {
            clearTimeout(this.workspaceScanTimeout);
        }
        this.workspaceScanTimeout = setTimeout(() => {
            this.workspaceScanTimeout = undefined;
            void this.scanWorkspace(triggerSource);
        }, delayMs);
    }

    public async scanWorkspace(triggerSource = 'workspace'): Promise<void> {
        const mode = this.getWorkspaceMode();
        this.status.workspaceMode = mode;
        if (mode === 'off') {
            this.workspaceScanGeneration++;
            this.collection.clear();
            this.status = {
                ...this.status,
                indexedFileCount: 0,
                filesWithDiagnostics: 0,
                lastScanDurationMs: 0,
                topRuleIds: [],
                isScanning: false
            };
            return;
        }
        if (mode !== 'workspace') {
            return;
        }

        const generation = ++this.workspaceScanGeneration;
        const started = Date.now();
        this.status = {
            ...this.status,
            workspaceMode: mode,
            isScanning: true
        };

        const ruleCounts = new Map<string, number>();
        let filesWithDiagnostics = 0;
        let indexedFileCount = 0;

        try {
            const files = (await this.getWorkspaceFiles()).slice(0, this.getWorkspaceFileLimit());
            indexedFileCount = files.length;
            logDiagnostics(`[Diagnostics] Workspace scan started (${triggerSource}), files=${files.length}`);
            for (const uri of files) {
                if (generation !== this.workspaceScanGeneration) {
                    break;
                }
                const doc = await this.getDocumentForWorkspaceUri(uri);
                if (doc === undefined) {
                    continue;
                }
                const diagnostics = await this.performAnalysis(doc);
                if (diagnostics.length > 0) {
                    filesWithDiagnostics++;
                    for (const diagnostic of diagnostics) {
                        const code = this.getDiagnosticCode(diagnostic);
                        if (code !== undefined) {
                            ruleCounts.set(code, (ruleCounts.get(code) ?? 0) + 1);
                        }
                    }
                }
            }
        } finally {
            if (generation === this.workspaceScanGeneration) {
                this.status = {
                    workspaceMode: mode,
                    indexedFileCount,
                    filesWithDiagnostics,
                    lastScanDurationMs: Date.now() - started,
                    topRuleIds: [...ruleCounts.entries()]
                        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
                        .slice(0, 10)
                        .map(([ruleId, count]) => ({ruleId, count})),
                    isScanning: false
                };
                logDiagnostics(`[Diagnostics] Workspace scan completed (${triggerSource}), files=${indexedFileCount}, filesWithDiagnostics=${filesWithDiagnostics}`);
            }
        }
    }

    public getStatus(): DiagnosticsStatus {
        return {
            ...this.status,
            workspaceMode: this.getWorkspaceMode(),
            topRuleIds: this.status.topRuleIds.map(item => ({...item}))
        };
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
    private async performAnalysis(doc: vscode.TextDocument): Promise<vscode.Diagnostic[]> {
        const key = this.getDocumentKey(doc);
        logDiagnostics(`[Diagnostics] Starting analysis for ${path.basename(doc.uri.fsPath)}`);

        const state = this.documentStates.get(key) ?? {version: doc.version, isAnalyzing: false};
        state.isAnalyzing = true;
        state.version = doc.version;
        this.documentStates.set(key, state);

        let analysisResult: vscode.Diagnostic[] = [];
        try {
            analysisResult = await this.performanceMonitor.measureAsync(
                'Thrift诊断分析',
                async () => {
                    try {
                        const includedFiles = getIncludedFiles(doc, this.workspaceIndex);
                        const cachedIncludedTypes = state.useCachedIncludes === true
                            ? collectIncludedTypesFromCache(includedFiles)
                            : null;
                        const includedTypes = cachedIncludedTypes
                            ?? await collectIncludedTypes(doc, this.errorHandler, logDiagnostics, this.workspaceIndex);

                        if (!cachedIncludedTypes) {
                            this.dependencyManager.trackFileDependencies(doc, includedFiles);
                        }

                        const text = doc.getText();
                        const lines = text.split('\n');
                        let issues: ThriftIssue[] = [];
                        let usedPartial = false;
                        let blockRange: LineRange | null = null;
                        let memberRange: LineRange | null = null;

                        if (state.useIncrementalDiagnostics === true && state.dirtyRange && state.lastAst && state.lastAnalysisContext) {
                            const changeRanges = Array.isArray(state.dirtyRanges) && state.dirtyRanges.length > 0
                                ? state.dirtyRanges
                                : [state.dirtyRange];
                            blockRange = findBestContainingRangeForChanges(state.lastAst, changeRanges);
                            if (blockRange) {
                                const blockKey = makeLineRangeKey(blockRange);
                                const blockLines = lines.slice(blockRange.startLine, blockRange.endLine + 1).join('\n');
                                const blockHash = hashText(blockLines);
                                const cachedBlock = state.lastBlockCache?.get(blockKey);
                                if (cachedBlock && cachedBlock.hash === blockHash) {
                                    issues = cachedBlock.issues;
                                    memberRange = findBestContainingMemberRangeForChanges(state.lastAst, changeRanges);
                                    usedPartial = true;
                                } else {
                                    let memberCacheHit = false;
                                    const partialLines = buildPartialLines(lines, blockRange.startLine, blockRange.endLine);
                                    const partialText = partialLines.join('\n');
                                    const partialKey = `${doc.uri.toString()}#partial:${blockRange.startLine}-${blockRange.endLine}`;
                                    try {
                                        const partialAst = ThriftParser.parseContentWithCache(partialKey, partialText);
                                        const blockNode = findContainingNode(partialAst, blockRange);
                                        memberRange = findBestContainingMemberRangeForChanges(partialAst, changeRanges);
                                        const memberKey = memberRange ? makeLineRangeKey(memberRange) : null;
                                        const memberHash = memberRange
                                            ? hashText(partialLines.slice(memberRange.startLine, memberRange.endLine + 1).join('\n'))
                                            : null;
                                        const cachedMember = memberKey !== null
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
                                                memberRange ?? undefined,
                                                getDiagnosticsRuleOptions()
                                            );
                                        }
                                        if (!memberCacheHit) {
                                            state.lastBlockCache ??= createBlockCache();
                                            let blockIssues = issues;
                                            if (blockRange !== null) {
                                                const blockRangeValue = blockRange;
                                                blockIssues = issues.filter(issue => rangeIntersectsLineRange(issue.range, blockRangeValue));
                                            }
                                            state.lastBlockCache.set(blockKey, {hash: blockHash, issues: blockIssues});
                                            state.lastMemberCache ??= createMemberCacheByBlock();
                                            if (blockNode !== null) {
                                                state.lastMemberCache.set(blockKey, buildMemberCacheForNode(blockNode, partialLines, issues));
                                            }
                                        } else if (memberKey !== null && memberRange && memberHash !== null) {
                                            state.lastMemberCache ??= createMemberCacheByBlock();
                                            const blockMembers = state.lastMemberCache.get(blockKey) ?? createMemberCache();
                                            blockMembers.set(memberKey, {range: memberRange, hash: memberHash, issues});
                                            state.lastMemberCache.set(blockKey, blockMembers);
                                        }

                                        if (blockNode !== null && state.lastAst !== undefined) {
                                            mergeBlockIntoAst(state.lastAst, blockNode, blockRange);
                                            state.blockAstCache = state.blockAstCache ?? new Map();
                                            state.blockAstCache.set(blockKey, {hash: blockHash, node: blockNode});
                                            state.lastAnalysisContext = buildAnalysisContext(state.lastAst);
                                        }
                                        usedPartial = true;
                                    } catch (error) {
                                        this.errorHandler.handleError(error, {
                                            component: 'DiagnosticManager',
                                            operation: 'parsePartialAst',
                                            filePath: doc.uri.fsPath,
                                            additionalInfo: {range: blockKey}
                                        });
                                        blockRange = null;
                                        memberRange = null;
                                    }
                                }
                            }
                        }

                        if (!usedPartial) {
                            const ast = ThriftParser.parseContentWithCache(doc.uri.toString(), text);
                            issues = analyzeThriftAst(ast, lines, includedTypes, undefined, undefined, getDiagnosticsRuleOptions());
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
                            ?? issues.map(i => this.toDiagnostic(i));

                        this.collection.set(doc.uri, diagnostics);
                        state.lastDiagnostics = diagnostics;

                        logDiagnostics(`文档 ${path.basename(doc.uri.fsPath)} 分析完成: ${diagnostics.length} 个问题`);
                        return diagnostics;
                    } catch (error) {
                        this.errorHandler.handleError(error, {
                            component: 'DiagnosticManager',
                            operation: 'analyzeDocument',
                            filePath: doc.uri.fsPath,
                            additionalInfo: {documentVersion: doc.version}
                        });
                        this.collection.set(doc.uri, []);
                        return [];
                    }
                },
                doc
            ) ?? [];
        } finally {
            state.isAnalyzing = false;
            state.lastAnalysis = Date.now();
            this.documentStates.set(key, state);
        }
        return analysisResult;
    }

    /**
     * 将内部 ThriftIssue 转为 vscode.Diagnostic，并附带 code/source 元数据，
     * 供 Code Action 等消费者按 code 精确识别。
     */
    private toDiagnostic(issue: ThriftIssue): vscode.Diagnostic {
        const diagnostic = new vscode.Diagnostic(toVscodeRange(issue.range), issue.message, issue.severity);
        if (issue.code !== undefined && issue.code !== '') {
            diagnostic.code = issue.code;
        }
        diagnostic.source = 'thrift';
        return diagnostic;
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
        if (state.useIncrementalDiagnostics !== true || !state.dirtyRange || !state.lastDiagnostics) {
            return null;
        }

        const lineRange = normalizeLineRange(state.dirtyRange);
        if (!lineRange) {
            return null;
        }

        const nextDiagnostics = issues
            .filter(issue => rangeIntersectsLineRange(issue.range, lineRange))
            .map(issue => this.toDiagnostic(issue));

        const preserved = state.lastDiagnostics.filter(diagnostic => !rangeIntersectsLineRange(diagnostic.range, lineRange));
        const merged = [...preserved, ...nextDiagnostics];

        logDiagnostics(`[Diagnostics] Incremental merge applied for ${path.basename(doc.uri.fsPath)} (lines ${lineRange.startLine}-${lineRange.endLine})`);

        return merged;
    }

    /**
     * 获取诊断调度器信息（用于性能监控）
     */
    public getSchedulerInfo(): {queued: number; processing: number} {
        return {
            queued: this.scheduler.getQueuedCount(),
            processing: this.scheduler.getProcessingCount()
        };
    }

    private async getWorkspaceFiles(): Promise<vscode.Uri[]> {
        if (this.workspaceIndex !== undefined) {
            return this.workspaceIndex.getAllFiles();
        }
        return vscode.workspace.findFiles(config.filePatterns.thrift, undefined, this.getWorkspaceFileLimit());
    }

    private async getDocumentForWorkspaceUri(uri: vscode.Uri): Promise<vscode.TextDocument | undefined> {
        const openDoc = vscode.workspace.textDocuments.find(doc => doc.uri.toString() === uri.toString());
        if (openDoc !== undefined) {
            return openDoc;
        }
        try {
            const text = this.workspaceIndex !== undefined
                ? await this.workspaceIndex.getText(uri)
                : new TextDecoder('utf-8').decode(await vscode.workspace.fs.readFile(uri));
            return createWorkspaceTextDocument(uri, text);
        } catch (error) {
            this.errorHandler.handleWarning('Workspace diagnostics file read failed', {
                component: 'DiagnosticManager',
                operation: 'getDocumentForWorkspaceUri',
                filePath: uri.fsPath,
                additionalInfo: {error: error instanceof Error ? error.message : String(error)}
            });
            return undefined;
        }
    }

    private getWorkspaceMode(): WorkspaceDiagnosticsMode {
        const value = vscode.workspace.getConfiguration('thrift.diagnostics')
            .get<string>('workspaceMode', 'openFiles');
        return value === 'workspace' || value === 'off' ? value : 'openFiles';
    }

    private getWorkspaceFileLimit(): number {
        const value = vscode.workspace.getConfiguration('thrift.diagnostics')
            .get<number>('workspaceFileLimit', 500);
        return Number.isInteger(value) && value > 0 ? value : 500;
    }

    private getDiagnosticCode(diagnostic: vscode.Diagnostic): string | undefined {
        if (diagnostic.code === undefined || diagnostic.code === null) {
            return undefined;
        }
        if (typeof diagnostic.code === 'object') {
            return String((diagnostic.code as {value: string | number}).value);
        }
        return String(diagnostic.code);
    }
}

function getDiagnosticsRuleOptions(): DiagnosticsRuleOptions {
    return {
        rules: vscode.workspace.getConfiguration('thrift.diagnostics').get('rules', {})
    };
}

function createWorkspaceTextDocument(uri: vscode.Uri, text: string): vscode.TextDocument {
    const lines = text.split('\n');
    return {
        uri,
        languageId: 'thrift',
        version: 0,
        getText: (range?: vscode.Range) => {
            if (range === undefined) {
                return text;
            }
            if (range.start.line === range.end.line) {
                return (lines[range.start.line] ?? '').slice(range.start.character, range.end.character);
            }
            const selected = lines.slice(range.start.line, range.end.line + 1);
            selected[0] = (selected[0] ?? '').slice(range.start.character);
            selected[selected.length - 1] = (selected[selected.length - 1] ?? '').slice(0, range.end.character);
            return selected.join('\n');
        },
        lineAt: (lineOrPosition: number | vscode.Position) => {
            const line = typeof lineOrPosition === 'number' ? lineOrPosition : lineOrPosition.line;
            return {text: lines[line] ?? ''} as vscode.TextLine;
        },
        lineCount: lines.length,
        fileName: uri.fsPath,
        isUntitled: false,
        isDirty: false,
        isClosed: false,
        eol: vscode.EndOfLine?.LF ?? 1,
        save: () => Promise.resolve(false),
        offsetAt: (position: vscode.Position) => {
            let offset = 0;
            for (let i = 0; i < position.line; i++) {
                offset += (lines[i] ?? '').length + 1;
            }
            return offset + position.character;
        },
        positionAt: (offset: number) => {
            let remaining = offset;
            for (let line = 0; line < lines.length; line++) {
                const length = (lines[line] ?? '').length;
                if (remaining <= length) {
                    return new vscode.Position(line, remaining);
                }
                remaining -= length + 1;
            }
            const lastLine = Math.max(0, lines.length - 1);
            return new vscode.Position(lastLine, (lines[lastLine] ?? '').length);
        },
        getWordRangeAtPosition: () => undefined,
        validateRange: (range: vscode.Range) => range,
        validatePosition: (position: vscode.Position) => position
    };
}
