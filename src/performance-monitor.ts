import * as vscode from 'vscode';
import { config } from './config';
import { ErrorHandler } from './utils/error-handler';

// 性能监控器 - 跟踪慢操作并提供优化建议
export interface PerformanceMetrics {
    operation: string;
    duration: number;
    timestamp: number;
    documentUri?: string;
    fileSize?: number;
}

export interface OperationStats {
    operation: string;
    count: number;
    avgDuration: number;
    minDuration: number;
    maxDuration: number;
    p95Duration: number;
    slowCount: number;
    lastDuration: number;
    lastTimestamp: number;
    avgFileSize?: number;
}

/**
 * PerformanceMonitor：记录并报告扩展性能指标。
 */
export interface PerformanceMonitorOptions {
    errorHandler?: ErrorHandler;
    slowOperationThreshold?: number;
    maxMetrics?: number;
}

export class PerformanceMonitor {
    private metrics: PerformanceMetrics[] = [];
    private slowOperationThreshold: number;
    private maxMetrics: number;
    private errorHandler: ErrorHandler;
    private readonly component = 'PerformanceMonitor';

    constructor(options: PerformanceMonitorOptions = {}) {
        this.errorHandler = options.errorHandler ?? new ErrorHandler();
        this.slowOperationThreshold =
            options.slowOperationThreshold ?? config.performance.slowOperationThresholdMs;
        this.maxMetrics = options.maxMetrics ?? config.performance.maxMetrics;
    }

    /**
     * 设置错误处理器。
     * @param errorHandler 错误处理器实例
     */
    public setErrorHandler(errorHandler: ErrorHandler): void {
        this.errorHandler = errorHandler;
    }

    /**
     * 同步测量指定操作的耗时。
     * @param operation 操作名称
     * @param fn 要执行的同步函数
     * @param document 相关文档（可选，用于记录文件大小）
     * @returns 函数执行结果
     */
    public measure<T>(operation: string, fn: () => T, document?: vscode.TextDocument): T {
        const start = performance.now();
        const result = fn();
        const duration = performance.now() - start;

        // 记录性能指标
        const metric: PerformanceMetrics = {
            operation,
            duration,
            timestamp: Date.now(),
            documentUri: document?.uri.toString(),
            fileSize: document ? document.getText().length : undefined
        };

        this.recordMetric(metric);

        // 如果操作很慢，发出警告
        if (duration > this.slowOperationThreshold) {
            this.warnSlowOperation(metric);
        }

        return result;
    }

    /**
     * 异步测量指定操作的耗时。
     * @param operation 操作名称
     * @param fn 要执行的异步函数
     * @param document 相关文档（可选）
     * @returns 函数执行结果 promise
     */
    public async measureAsync<T>(operation: string, fn: () => Promise<T>, document?: vscode.TextDocument): Promise<T> {
        const start = performance.now();
        const result = await fn();
        const duration = performance.now() - start;

        const metric: PerformanceMetrics = {
            operation,
            duration,
            timestamp: Date.now(),
            documentUri: document?.uri.toString(),
            fileSize: document ? document.getText().length : undefined
        };

        this.recordMetric(metric);

        if (duration > this.slowOperationThreshold) {
            this.warnSlowOperation(metric);
        }

        return result;
    }

    /**
     * 生成性能报告文本。
     * @returns 性能报告 Markdown 文本
     */
    public getPerformanceReport(): string {
        if (this.metrics.length === 0) {
            return '暂无性能数据';
        }

        const recentMetrics = this.metrics.slice(-20); // 最近20条记录
        const avgDuration = recentMetrics.reduce((sum, m) => sum + m.duration, 0) / recentMetrics.length;
        const maxDuration = Math.max(...recentMetrics.map(m => m.duration));
        const slowOperations = recentMetrics.filter(m => m.duration > this.slowOperationThreshold);
        const opStats = this.getOperationStats();

        let report = `## Thrift Support 性能报告\n\n`;
        report += `**统计时间:** ${new Date().toLocaleString()}\n`;
        report += `**总操作数:** ${this.metrics.length}\n`;
        report += `**平均响应时间:** ${avgDuration.toFixed(2)}ms\n`;
        report += `**最大响应时间:** ${maxDuration.toFixed(2)}ms\n`;
        report += `**慢操作数 (>${this.slowOperationThreshold}ms):** ${slowOperations.length}\n\n`;

        if (typeof process !== 'undefined' && typeof process.memoryUsage === 'function') {
            const mem = process.memoryUsage();
            report += `**内存占用:** rss ${(mem.rss / 1024 / 1024).toFixed(1)}MB, heap ${(mem.heapUsed / 1024 / 1024).toFixed(1)}MB\n\n`;
        }

        if (opStats.length > 0) {
            report += `### 操作统计\n`;
            opStats.forEach(stat => {
                const sizeInfo = typeof stat.avgFileSize === 'number'
                    ? `, avgFile=${(stat.avgFileSize / 1024).toFixed(1)}KB`
                    : '';
                report += `- **${stat.operation}**: count=${stat.count}, avg=${stat.avgDuration.toFixed(2)}ms, p95=${stat.p95Duration.toFixed(2)}ms, max=${stat.maxDuration.toFixed(2)}ms, slow=${stat.slowCount}${sizeInfo}\n`;
            });
            report += '\n';
        }

        if (slowOperations.length > 0) {
            report += `### 慢操作详情\n`;
            slowOperations.forEach(metric => {
                const fileInfo = metric.documentUri ? vscode.workspace.asRelativePath(metric.documentUri) : '未知文件';
                report += `- **${metric.operation}**: ${metric.duration.toFixed(2)}ms (${fileInfo})\n`;
            });
        }

        return report;
    }

    /**
     * 打开并展示性能报告。
     */
    public async showPerformanceReport(): Promise<void> {
        const report = this.getPerformanceReport();
        const doc = await vscode.workspace.openTextDocument({
            content: report,
            language: 'markdown'
        });
        await vscode.window.showTextDocument(doc, { preview: true });
    }

    /**
     * 清理所有性能数据。
     */
    public clearMetrics(): void {
        this.metrics = [];
    }

    /**
     * 统计慢操作的次数与平均耗时。
     * @returns 慢操作统计列表
     */
    public getSlowOperationStats(): { operation: string; count: number; avgDuration: number }[] {
        const slowOps = this.metrics.filter(m => m.duration > this.slowOperationThreshold);
        const stats = new Map<string, { count: number; totalDuration: number }>();

        slowOps.forEach(metric => {
            const existing = stats.get(metric.operation) || { count: 0, totalDuration: 0 };
            existing.count++;
            existing.totalDuration += metric.duration;
            stats.set(metric.operation, existing);
        });

        return Array.from(stats.entries()).map(([operation, data]) => ({
            operation,
            count: data.count,
            avgDuration: data.totalDuration / data.count
        }));
    }

    /**
     * 汇总每个操作的统计信息。
     * @returns 操作统计详情列表
     */
    public getOperationStats(): OperationStats[] {
        const stats = new Map<string, OperationStats>();

        for (const metric of this.metrics) {
            const existing = stats.get(metric.operation);
            if (!existing) {
                stats.set(metric.operation, {
                    operation: metric.operation,
                    count: 1,
                    avgDuration: metric.duration,
                    minDuration: metric.duration,
                    maxDuration: metric.duration,
                    p95Duration: metric.duration,
                    slowCount: metric.duration > this.slowOperationThreshold ? 1 : 0,
                    lastDuration: metric.duration,
                    lastTimestamp: metric.timestamp,
                    avgFileSize: typeof metric.fileSize === 'number' ? metric.fileSize : undefined
                });
            } else {
                existing.count += 1;
                existing.avgDuration += metric.duration;
                existing.minDuration = Math.min(existing.minDuration, metric.duration);
                existing.maxDuration = Math.max(existing.maxDuration, metric.duration);
                existing.slowCount += metric.duration > this.slowOperationThreshold ? 1 : 0;
                existing.lastDuration = metric.duration;
                existing.lastTimestamp = metric.timestamp;
                if (typeof metric.fileSize === 'number') {
                    const prev = typeof existing.avgFileSize === 'number' ? existing.avgFileSize : 0;
                    existing.avgFileSize = prev + metric.fileSize;
                }
            }
        }

        const result: OperationStats[] = [];
        for (const stat of stats.values()) {
            const durations = this.metrics
                .filter(m => m.operation === stat.operation)
                .map(m => m.duration)
                .sort((a, b) => a - b);
            stat.avgDuration = stat.avgDuration / stat.count;
            stat.p95Duration = this.percentile(durations, 0.95);
            if (typeof stat.avgFileSize === 'number') {
                stat.avgFileSize = stat.avgFileSize / stat.count;
            }
            result.push(stat);
        }

        // Sort by count desc, then avg duration desc
        result.sort((a, b) => (b.count - a.count) || (b.avgDuration - a.avgDuration));
        return result;
    }

    private recordMetric(metric: PerformanceMetrics): void {
        this.metrics.push(metric);

        // 限制记录数量，避免内存泄漏
        if (this.metrics.length > this.maxMetrics) {
            this.metrics = this.metrics.slice(-this.maxMetrics);
        }
    }

    private warnSlowOperation(metric: PerformanceMetrics): void {
        this.errorHandler.handleWarning(
            `Slow operation detected: ${metric.operation} took ${metric.duration.toFixed(2)}ms`,
            {
                component: this.component,
                operation: 'warnSlowOperation',
                filePath: metric.documentUri
            }
        );

        // 如果操作特别慢，只在控制台记录，不显示弹窗
        if (metric.duration > 500) {
            const fileInfo = metric.documentUri ? ` in ${vscode.workspace.asRelativePath(metric.documentUri)}` : '';
            const sizeInfo = metric.fileSize ? ` (${(metric.fileSize / 1024).toFixed(1)}KB)` : '';

            this.errorHandler.handleWarning(
                `Slow operation: ${metric.operation} took ${metric.duration.toFixed(0)}ms${fileInfo}${sizeInfo}`,
                {
                    component: this.component,
                    operation: 'warnSlowOperation',
                    filePath: metric.documentUri
                }
            );
        }
    }

    private percentile(values: number[], p: number): number {
        if (values.length === 0) {
            return 0;
        }
        const index = Math.min(values.length - 1, Math.max(0, Math.ceil(values.length * p) - 1));
        return values[index];
    }
}

export function createPerformanceMonitor(options: PerformanceMonitorOptions = {}): PerformanceMonitor {
    return new PerformanceMonitor(options);
}

export const performanceMonitor = createPerformanceMonitor();
