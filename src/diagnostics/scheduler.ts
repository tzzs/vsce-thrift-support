import * as vscode from 'vscode';
import { config } from '../config';
import { logDiagnostics } from './logger';
import * as path from 'path';

export interface SchedulerOptions {
    immediate?: boolean;
    throttleState?: { lastAnalysis?: number; isAnalyzing: boolean; version: number };
}

/**
 * Handles scheduling, throttling and concurrency for diagnostics analysis.
 * 分析调度器：负责管理诊断任务的队列、并发控制与节流。
 */
export class AnalysisScheduler {
    /** 分析队列（按文档 key 管理） */
    private analysisQueue = new Map<string, NodeJS.Timeout>();

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
        const { immediate, throttleState } = options;

        const existingTimeout = this.analysisQueue.get(key);
        if (existingTimeout) {
            clearTimeout(existingTimeout);
        }

        const now = Date.now();
        const lastGap = throttleState?.lastAnalysis ? now - throttleState.lastAnalysis : Number.POSITIVE_INFINITY;
        const throttleDelay = lastGap < this.MIN_ANALYSIS_INTERVAL ? this.MIN_ANALYSIS_INTERVAL - lastGap : 0;

        if (throttleState?.isAnalyzing) {
            return false;
        }
        if (throttleState && throttleState.version === doc.version && throttleDelay === 0) {
            return false;
        }

        const baseDelay = immediate ? 0 : this.ANALYSIS_DELAY;
        const delay = Math.max(baseDelay, throttleDelay);

        const timeout = setTimeout(() => {
            this.analysisQueue.delete(key);
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
    }

    public dispose() {
        for (const timeout of this.analysisQueue.values()) {
            clearTimeout(timeout);
        }
        this.analysisQueue.clear();
        this.analysisWaiters = [];
        this.pendingAnalyses.clear();
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
                this.pendingAnalyses.delete(key);
                await runTask();
            } finally {
                this.releaseSlot();
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
}
