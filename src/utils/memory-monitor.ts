import * as vscode from 'vscode';
import { ErrorHandler } from './error-handler';

export interface MemoryUsageInfo {
    /** 当前内存使用量（字节） */
    currentUsage: number;
    /** 内存使用峰值（字节） */
    peakUsage: number;
    /** 缓存分配的内存估算（字节） */
    cacheAllocated: number;
    /** 缓存实际使用的内存估算（字节） */
    cacheUsed: number;
    /** 时间戳 */
    timestamp: number;
}

export interface CacheStatistics {
    /** 缓存名称 */
    name: string;
    /** 缓存大小 */
    size: number;
    /** 最大容量 */
    maxSize: number;
    /** 命中率 */
    hitRate: number;
    /** 清理次数 */
    cleanupCount: number;
    /** 最后清理时间 */
    lastCleanup: number;
}

export interface PerformanceMetrics {
    operation: string;
    duration: number; // Using duration field to store memory usage
    timestamp: number;
    documentUri?: string;
}

/**
 * 内存监控器 - 跟踪扩展内存使用情况并提供内存优化建议。
 */
export class MemoryMonitor {
    private static instance: MemoryMonitor;

    private memoryHistory: MemoryUsageInfo[] = [];
    private cacheStats: Map<string, CacheStatistics> = new Map();
    private peakUsage: number = 0;
    private errorHandler: ErrorHandler;
    private readonly MAX_HISTORY_SIZE = 100; // 保留最近100条记录
    private readonly MEMORY_CHECK_INTERVAL = 30000; // 30秒检查一次

    constructor(errorHandler?: ErrorHandler) {
        this.errorHandler = errorHandler ?? new ErrorHandler();
    }

    static getInstance(): MemoryMonitor {
        if (!MemoryMonitor.instance) {
            MemoryMonitor.instance = new MemoryMonitor();
        }
        return MemoryMonitor.instance;
    }

    /**
     * 记录当前内存使用情况
     */
    public recordMemoryUsage(): void {
        try {
            const usage = this.getCurrentMemoryUsage();

            // 更新峰值
            if (usage.currentUsage > this.peakUsage) {
                this.peakUsage = usage.currentUsage;
                usage.peakUsage = this.peakUsage;
            }

            // 添加到历史记录
            this.memoryHistory.push(usage);

            // 限制历史记录大小
            if (this.memoryHistory.length > this.MAX_HISTORY_SIZE) {
                this.memoryHistory = this.memoryHistory.slice(-this.MAX_HISTORY_SIZE);
            }
        } catch (error) {
            this.errorHandler.handleError(error, {
                component: 'MemoryMonitor',
                operation: 'recordMemoryUsage'
            });
        }
    }

    /**
     * 获取当前内存使用情况
     */
    private getCurrentMemoryUsage(): MemoryUsageInfo {
        let currentUsage = 0;
        let cacheAllocated = 0;
        let cacheUsed = 0;

        // 获取V8堆内存信息
        if (typeof process !== 'undefined' && process.memoryUsage) {
            const mem = process.memoryUsage();
            currentUsage = mem.heapUsed || 0;

            // 估算缓存占用的内存
            for (const [_, stats] of this.cacheStats) {
                // 基于缓存大小估算内存使用（这里使用简单的估算方法）
                cacheUsed += stats.size * 1024; // 假设每个条目平均占用1KB
                cacheAllocated += stats.maxSize * 1024;
            }
        }

        return {
            currentUsage,
            peakUsage: this.peakUsage,
            cacheAllocated,
            cacheUsed,
            timestamp: Date.now()
        };
    }

    /**
     * 更新缓存统计信息
     */
    public updateCacheStats(cacheName: string, stats: Partial<CacheStatistics>): void {
        const existing = this.cacheStats.get(cacheName) || {
            name: cacheName,
            size: 0,
            maxSize: 0,
            hitRate: 0,
            cleanupCount: 0,
            lastCleanup: 0
        };

        const updatedStats = { ...existing, ...stats };
        this.cacheStats.set(cacheName, updatedStats);
    }

    /**
     * 获取内存使用报告
     */
    public getMemoryReport(): string {
        if (this.memoryHistory.length === 0) {
            return '暂无内存使用数据';
        }

        const latest = this.memoryHistory[this.memoryHistory.length - 1];
        const avgUsage = this.memoryHistory.reduce((sum, m) => sum + m.currentUsage, 0) / this.memoryHistory.length;

        let report = `## Thrift Support 内存使用报告\n\n`;
        report += `**统计时间:** ${new Date().toLocaleString()}\n`;
        report += `**当前内存使用:** ${(latest.currentUsage / 1024 / 1024).toFixed(2)} MB\n`;
        report += `**内存使用峰值:** ${(latest.peakUsage / 1024 / 1024).toFixed(2)} MB\n`;
        report += `**平均内存使用:** ${(avgUsage / 1024 / 1024).toFixed(2)} MB\n`;
        report += `**缓存估算使用:** ${(latest.cacheUsed / 1024 / 1024).toFixed(2)} MB\n`;
        report += `**缓存估算分配:** ${(latest.cacheAllocated / 1024 / 1024).toFixed(2)} MB\n\n`;

        if (this.cacheStats.size > 0) {
            report += `### 缓存统计\n`;
            for (const [name, stats] of this.cacheStats) {
                report += `- **${name}**: size=${stats.size}/${stats.maxSize}, hitRate=${(stats.hitRate * 100).toFixed(1)}%, cleanups=${stats.cleanupCount}\n`;
            }
            report += '\n';
        }

        // 添加内存优化建议
        report += `### 内存优化建议\n`;
        if (latest.currentUsage > latest.peakUsage * 0.8) {
            report += '- ⚠️ 当前内存使用接近峰值，考虑清理不必要的缓存\n';
        }

        for (const [name, stats] of this.cacheStats) {
            if (stats.size > stats.maxSize * 0.8) {
                report += `- ⚠️ 缓存 "${name}" 使用率过高 (${Math.round((stats.size/stats.maxSize)*100)}%)，考虑清理\n`;
            }
            if (stats.hitRate < 0.5) {
                report += `- ⚠️ 缓存 "${name}" 命中率较低 (${(stats.hitRate*100).toFixed(1)}%)，考虑调整策略\n`;
            }
        }

        return report;
    }

    /**
     * 获取内存使用趋势数据，用于图表展示
     */
    public getMemoryTrendData(): PerformanceMetrics[] {
        return this.memoryHistory.map(usage => ({
            operation: 'memory-usage',
            duration: usage.currentUsage, // 重用duration字段存储内存使用量
            timestamp: usage.timestamp,
            documentUri: 'memory'
        }));
    }

    /**
     * 手动触发垃圾回收（如果可用）
     */
    public forceGarbageCollection(): void {
        if (global.gc) {
            global.gc();
            this.recordMemoryUsage();
        }
    }

    /**
     * 清理内存历史记录
     */
    public clearMemoryHistory(): void {
        this.memoryHistory = [];
    }

    /**
     * 检查是否内存使用过高
     */
    public isHighMemoryUsage(thresholdRatio: number = 0.8): boolean {
        if (this.memoryHistory.length === 0) {
            return false;
        }

        const latest = this.memoryHistory[this.memoryHistory.length - 1];
        return latest.peakUsage > 0 && (latest.currentUsage / latest.peakUsage) > thresholdRatio;
    }

    /**
     * 获取缓存统计信息
     */
    public getAllCacheStats(): Map<string, CacheStatistics> {
        return new Map(this.cacheStats);
    }

    /**
     * 获取当前内存使用量
     */
    public getCurrentUsage(): number {
        if (this.memoryHistory.length === 0) {
            return 0;
        }
        return this.memoryHistory[this.memoryHistory.length - 1].currentUsage;
    }

    /**
     * 获取峰值内存使用量
     */
    public getPeakUsage(): number {
        return this.peakUsage;
    }
}