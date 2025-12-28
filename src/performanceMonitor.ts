import * as vscode from 'vscode';

// 性能监控器 - 跟踪慢操作并提供优化建议
export interface PerformanceMetrics {
    operation: string;
    duration: number;
    timestamp: number;
    documentUri?: string;
    fileSize?: number;
}

export class PerformanceMonitor {
    private static metrics: PerformanceMetrics[] = [];
    private static slowOperationThreshold = 100; // 100ms 为慢操作阈值
    private static maxMetrics = 100; // 最多保留100条记录

    // 测量操作性能
    public static measure<T>(operation: string, fn: () => T, document?: vscode.TextDocument): T {
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

    // 异步版本
    public static async measureAsync<T>(operation: string, fn: () => Promise<T>, document?: vscode.TextDocument): Promise<T> {
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

    // 获取性能报告
    public static getPerformanceReport(): string {
        if (this.metrics.length === 0) {
            return '暂无性能数据';
        }

        const recentMetrics = this.metrics.slice(-20); // 最近20条记录
        const avgDuration = recentMetrics.reduce((sum, m) => sum + m.duration, 0) / recentMetrics.length;
        const maxDuration = Math.max(...recentMetrics.map(m => m.duration));
        const slowOperations = recentMetrics.filter(m => m.duration > this.slowOperationThreshold);

        let report = `## Thrift Support 性能报告\n\n`;
        report += `**统计时间:** ${new Date().toLocaleString()}\n`;
        report += `**总操作数:** ${this.metrics.length}\n`;
        report += `**平均响应时间:** ${avgDuration.toFixed(2)}ms\n`;
        report += `**最大响应时间:** ${maxDuration.toFixed(2)}ms\n`;
        report += `**慢操作数 (>${this.slowOperationThreshold}ms):** ${slowOperations.length}\n\n`;

        if (slowOperations.length > 0) {
            report += `### 慢操作详情\n`;
            slowOperations.forEach(metric => {
                const fileInfo = metric.documentUri ? vscode.workspace.asRelativePath(metric.documentUri) : '未知文件';
                report += `- **${metric.operation}**: ${metric.duration.toFixed(2)}ms (${fileInfo})\n`;
            });
        }

        return report;
    }

    // 显示性能报告
    public static async showPerformanceReport(): Promise<void> {
        const report = this.getPerformanceReport();
        const doc = await vscode.workspace.openTextDocument({
            content: report,
            language: 'markdown'
        });
        await vscode.window.showTextDocument(doc, {preview: true});
    }

    // 清理性能数据
    public static clearMetrics(): void {
        this.metrics = [];
    }

    // 获取慢操作统计
    public static getSlowOperationStats(): { operation: string; count: number; avgDuration: number }[] {
        const slowOps = this.metrics.filter(m => m.duration > this.slowOperationThreshold);
        const stats = new Map<string, { count: number; totalDuration: number }>();

        slowOps.forEach(metric => {
            const existing = stats.get(metric.operation) || {count: 0, totalDuration: 0};
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

    private static recordMetric(metric: PerformanceMetrics): void {
        this.metrics.push(metric);

        // 限制记录数量，避免内存泄漏
        if (this.metrics.length > this.maxMetrics) {
            this.metrics = this.metrics.slice(-this.maxMetrics);
        }
    }

    private static warnSlowOperation(metric: PerformanceMetrics): void {
        console.warn(`[Thrift Support] Slow operation detected: ${metric.operation} took ${metric.duration.toFixed(2)}ms`);

        // 如果操作特别慢，只在控制台记录，不显示弹窗
        if (metric.duration > 500) {
            const fileInfo = metric.documentUri ? ` in ${vscode.workspace.asRelativePath(metric.documentUri)}` : '';
            const sizeInfo = metric.fileSize ? ` (${(metric.fileSize / 1024).toFixed(1)}KB)` : '';

            // 只在控制台记录，不显示弹窗干扰用户
            console.warn(`[Thrift Performance] Slow operation: ${metric.operation} took ${metric.duration.toFixed(0)}ms${fileInfo}${sizeInfo}`);
        }
    }
}
