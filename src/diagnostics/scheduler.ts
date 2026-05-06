import * as vscode from 'vscode';
import {config} from '../config';

export interface SchedulerOptions {
    immediate?: boolean;
    throttleState?: {lastAnalysis?: number; isAnalyzing: boolean; version: number};
}

/**
 * Handles scheduling, throttling and concurrency for diagnostics analysis.
 * 分析调度器：负责管理诊断任务的队列、并发控制与节流。
 */
export class AnalysisScheduler {
    /** 分析队列（按文档 key 管理） */
    private analysisQueue = new Map<string, NodeJS.Timeout>();
    /** 当前正在处理的文档集合 */
    private processingDocuments = new Set<string>();
    /** 在处理期间被标记为需要重跑的任务 */
    private pendingReschedules = new Map<string, {doc: vscode.TextDocument; runTask: () => Promise<void> | void}>();
    /** 已取消的文档（避免在处理中触发重跑） */
    private cancelledDocuments = new Set<string>();

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

    /**
     * Schedule a task for execution.
     * @param doc 目标文档
     * @param options 调度选项（是否立即执行、节流状态）
     * @param runTask 实际要执行的任务函数
     * @param onScheduled 任务被调度时的回调（返回 timeout 句柄）
     * @returns 是否成功调度（true=已加入队列，false=被节流或跳过）
     */
    public schedule(
        doc: vscode.TextDocument,
        options: SchedulerOptions,
        runTask: () => void,
        onScheduled: (timeout: NodeJS.Timeout) => void
    ): boolean {
        const key = this.getDocumentKey(doc);
        this.cancelledDocuments.delete(key);
        const {immediate, throttleState} = options;

        const existingTimeout = this.analysisQueue.get(key);
        if (existingTimeout) {
            clearTimeout(existingTimeout);
        }

        const now = Date.now();
        const lastGap = throttleState?.lastAnalysis ? now - throttleState.lastAnalysis : Number.POSITIVE_INFINITY;
        const throttleDelay = lastGap < this.MIN_ANALYSIS_INTERVAL ? this.MIN_ANALYSIS_INTERVAL - lastGap : 0;

        const shouldSkipSameVersion = !!(throttleState && throttleState.version === doc.version && throttleDelay === 0);

        if (throttleState?.isAnalyzing || this.processingDocuments.has(key)) {
            if (shouldSkipSameVersion) {
                return false;
            }
            this.pendingReschedules.set(key, {doc, runTask});
            return true;
        }

        if (shouldSkipSameVersion) {
            return false;
        }

        const baseDelay = immediate ? 0 : this.ANALYSIS_DELAY;
        const delay = Math.max(baseDelay, throttleDelay);

        const timeout = setTimeout(() => {
            this.analysisQueue.delete(key);
            this.processingDocuments.add(key);
            this.enqueue(doc, runTask);
        }, delay);

        this.analysisQueue.set(key, timeout);
        onScheduled(timeout);

        return true;
    }

    public cancel(doc: vscode.TextDocument) {
        const key = this.getDocumentKey(doc);
        const timeout = this.analysisQueue.get(key);
        if (timeout) {
            clearTimeout(timeout);
            this.analysisQueue.delete(key);
        }
        this.pendingReschedules.delete(key);
        this.cancelledDocuments.add(key);
    }

    public dispose() {
        for (const timeout of this.analysisQueue.values()) {
            clearTimeout(timeout);
        }
        this.analysisQueue.clear();
        this.analysisWaiters = [];
        this.pendingAnalyses.clear();
        this.processingDocuments.clear();
        this.pendingReschedules.clear();
        this.cancelledDocuments.clear();
        this.inFlightAnalyses = 0;
    }

    private enqueue(doc: vscode.TextDocument, runTask: () => Promise<void> | void) {
        const key = this.getDocumentKey(doc);
        if (this.pendingAnalyses.has(key)) {
            return;
        }
        this.pendingAnalyses.add(key);
        const run = async () => {
            try {
                await this.waitForSlot();
                if (this.cancelledDocuments.has(key)) {
                    this.pendingAnalyses.delete(key);
                    return;
                }
                this.pendingAnalyses.delete(key);
                await runTask();
            } finally {
                this.releaseSlot();
                this.processingDocuments.delete(key);
                const pending = this.pendingReschedules.get(key);
                if (pending && !this.cancelledDocuments.has(key)) {
                    this.pendingReschedules.delete(key);
                    this.processingDocuments.add(key);
                    this.enqueue(pending.doc, pending.runTask);
                }
            }
        };
        void run();
    }

    private async waitForSlot() {
        if (this.inFlightAnalyses < this.MAX_CONCURRENT_ANALYSES) {
            this.inFlightAnalyses++;
            return;
        }
        await new Promise<void>((resolve) => this.analysisWaiters.push(resolve));
        this.inFlightAnalyses++;
    }

    private releaseSlot() {
        this.inFlightAnalyses = Math.max(0, this.inFlightAnalyses - 1);
        const waiter = this.analysisWaiters.shift();
        if (waiter) {
            waiter();
        }
    }

    private getDocumentKey(doc: vscode.TextDocument): string {
        return doc.uri.toString();
    }

    /**
     * 获取当前正在处理的文档数量
     */
    public getProcessingCount(): number {
        return this.inFlightAnalyses;
    }

    /**
     * 获取队列中的分析任务数量
     */
    public getQueuedCount(): number {
        return this.analysisQueue.size + this.pendingReschedules.size + this.pendingAnalyses.size;
    }
}
