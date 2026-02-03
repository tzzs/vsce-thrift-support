import * as vscode from 'vscode';
import { ErrorHandler } from './error-handler';
import {ReportBuilder, formatMb} from './report-builder';

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

export interface MemoryOptimizationSuggestion {
    id: string;
    type: 'eviction' | 'resize' | 'cleanup' | 'disable' | 'optimize';
    description: string;
    severity: 'low' | 'medium' | 'high';
    impact: 'memory' | 'performance' | 'both';
    confidence: number; // 0-1
    recommendation: string;
    affectedComponents: string[];
}

export interface MemoryTrend {
    slope: number; // 内存变化趋势斜率
    stability: 'increasing' | 'decreasing' | 'stable';
    period: number; // 趋势分析的时间窗口（毫秒）
}

/**
 * 趋势分析器
 */
class TrendAnalyzer {
    private samples: {timestamp: number, usage: number}[] = [];
    private readonly maxSamples: number = 50; // 最多保存50个样本

    public addSample(timestamp: number, usage: number): void {
        this.samples.push({timestamp, usage});
        if (this.samples.length > this.maxSamples) {
            this.samples = this.samples.slice(-this.maxSamples); // 保留最新的样本
        }
    }

    public calculateTrend(): MemoryTrend {
        if (this.samples.length < 3) {
            return {slope: 0, stability: 'stable', period: 0};
        }

        // 使用最小二乘法计算趋势线
        const n = this.samples.length;
        let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;

        for (let i = 0; i < n; i++) {
            const x = this.samples[i].timestamp;
            const y = this.samples[i].usage;
            sumX += x;
            sumY += y;
            sumXY += x * y;
            sumXX += x * x;
        }

        const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);

        let stability: 'increasing' | 'decreasing' | 'stable';
        if (slope > 1000) { // 每秒增加超过1MB
            stability = 'increasing';
        } else if (slope < -1000) { // 每秒减少超过1MB
            stability = 'decreasing';
        } else {
            stability = 'stable';
        }

        return {
            slope,
            stability,
            period: this.samples[this.samples.length - 1].timestamp - this.samples[0].timestamp
        };
    }

    public getAverageUsage(): number {
        if (this.samples.length === 0) return 0;
        const total = this.samples.reduce((sum, sample) => sum + sample.usage, 0);
        return total / this.samples.length;
    }
}

/**
 * 预测引擎
 */
class PredictionEngine {
    private trendAnalyzer: TrendAnalyzer;

    constructor(trendAnalyzer: TrendAnalyzer) {
        this.trendAnalyzer = trendAnalyzer;
    }

    public predictMemoryUsage(windowMs: number): number {
        const trend = this.trendAnalyzer.calculateTrend();
        const currentUsage = this.trendAnalyzer['samples'].length > 0
            ? this.trendAnalyzer['samples'][this.trendAnalyzer['samples'].length - 1].usage
            : 0;

        // 基于趋势预测未来的内存使用
        const predictedIncrease = trend.slope * (windowMs / 1000); // 假设斜率是每秒的变化
        return Math.max(0, currentUsage + predictedIncrease);
    }
}

/**
 * 优化建议生成器
 */
class OptimizationAdvisor {
    public generateSuggestions(
        currentUsage: number,
        peakUsage: number,
        cacheStats: Map<string, CacheStatistics>,
        trend: MemoryTrend
    ): MemoryOptimizationSuggestion[] {
        const suggestions: MemoryOptimizationSuggestion[] = [];

        // 建议1: 高内存使用率
        if (peakUsage > 0) {
            const usageRatio = currentUsage / peakUsage;
            if (usageRatio > 0.85) {
                suggestions.push({
                    id: 'high-memory-usage',
                    type: 'eviction',
                    description: '内存使用率过高，接近峰值的85%',
                    severity: 'high',
                    impact: 'memory',
                    confidence: 0.9,
                    recommendation: '立即执行缓存清理，并考虑减少缓存大小',
                    affectedComponents: ['all-caches']
                });
            } else if (usageRatio > 0.7) {
                suggestions.push({
                    id: 'moderate-memory-usage',
                    type: 'eviction',
                    description: '内存使用率较高，超过峰值的70%',
                    severity: 'medium',
                    impact: 'memory',
                    confidence: 0.7,
                    recommendation: '考虑主动清理部分缓存项',
                    affectedComponents: ['all-caches']
                });
            }
        }

        // 建议2: 缓存使用率过高
        for (const [name, stats] of cacheStats) {
            if (stats.size > stats.maxSize * 0.9) {
                suggestions.push({
                    id: `high-cache-usage-${name}`,
                    type: 'resize',
                    description: `缓存 "${name}" 使用率超过90%`,
                    severity: 'medium',
                    impact: 'memory',
                    confidence: 0.8,
                    recommendation: `考虑清理缓存 "${name}" 或增加其最大容量`,
                    affectedComponents: [name]
                });
            }

            if (stats.hitRate < 0.3) {
                suggestions.push({
                    id: `low-hit-rate-${name}`,
                    type: 'optimize',
                    description: `缓存 "${name}" 命中率过低(${(stats.hitRate * 100).toFixed(1)}%)`,
                    severity: 'medium',
                    impact: 'performance',
                    confidence: 0.75,
                    recommendation: `考虑调整缓存 "${name}" 的策略或完全禁用该缓存`,
                    affectedComponents: [name]
                });
            }
        }

        // 建议3: 内存增长趋势
        if (trend.stability === 'increasing' && trend.slope > 100000) { // 每秒增加超过100KB
            suggestions.push({
                id: 'memory-increase-trend',
                type: 'cleanup',
                description: '内存使用呈现持续上升趋势',
                severity: 'high',
                impact: 'memory',
                confidence: 0.85,
                recommendation: '执行全面的缓存清理，并检查是否存在内存泄漏',
                affectedComponents: ['all-components']
            });
        }

        return suggestions.sort((a, b) =>
            this.severityScore(b.severity) - this.severityScore(a.severity)
        );
    }

    private severityScore(severity: string): number {
        switch (severity) {
            case 'high': return 3;
            case 'medium': return 2;
            case 'low': return 1;
            default: return 0;
        }
    }
}

/**
 * 智能内存监控器 - 跟踪扩展内存使用情况并提供内存优化建议。
 */
export class SmartMemoryMonitor {
    private static instance: SmartMemoryMonitor;

    private memoryHistory: MemoryUsageInfo[] = [];
    private cacheStats: Map<string, CacheStatistics> = new Map();
    private peakUsage: number = 0;
    private errorHandler: ErrorHandler;
    private readonly MAX_HISTORY_SIZE = 100; // 保留最近100条记录
    private readonly MEMORY_CHECK_INTERVAL = 30000; // 30秒检查一次

    // 新增的智能组件
    private trendAnalyzer: TrendAnalyzer;
    private predictionEngine: PredictionEngine;
    private optimizationAdvisor: OptimizationAdvisor;

    constructor(errorHandler?: ErrorHandler) {
        this.errorHandler = errorHandler ?? new ErrorHandler();
        this.trendAnalyzer = new TrendAnalyzer();
        this.predictionEngine = new PredictionEngine(this.trendAnalyzer);
        this.optimizationAdvisor = new OptimizationAdvisor();
    }

    static getInstance(): SmartMemoryMonitor {
        if (!SmartMemoryMonitor.instance) {
            SmartMemoryMonitor.instance = new SmartMemoryMonitor();
        }
        return SmartMemoryMonitor.instance;
    }

    /**
     * 记录当前内存使用情况
     */
    public recordMemoryUsage(): void {
        const usage = this.errorHandler.safe(() => this.getCurrentMemoryUsage(), null);
        if (!usage) {
            return;
        }

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

        // 添加到趋势分析器
        this.trendAnalyzer.addSample(usage.timestamp, usage.currentUsage);
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

        // 获取趋势信息
        const trend = this.trendAnalyzer.calculateTrend();

        const report = new ReportBuilder();
        report.add('## Thrift Support 内存使用报告');
        report.add();
        report.add(`**统计时间:** ${new Date().toLocaleString()}`);
        report.add(`**当前内存使用:** ${formatMb(latest.currentUsage)}`);
        report.add(`**内存使用峰值:** ${formatMb(latest.peakUsage)}`);
        report.add(`**平均内存使用:** ${formatMb(avgUsage)}`);
        report.add(`**缓存估算使用:** ${formatMb(latest.cacheUsed)}`);
        report.add(`**缓存估算分配:** ${formatMb(latest.cacheAllocated)}`);
        report.add(`**内存趋势:** ${trend.stability} (变化率: ${trend.slope.toFixed(2)} bytes/sec)`);
        report.add();

        if (this.cacheStats.size > 0) {
            report.add('### 缓存统计');
            for (const [name, stats] of this.cacheStats) {
                report.add(`- **${name}**: size=${stats.size}/${stats.maxSize}, hitRate=${(stats.hitRate * 100).toFixed(1)}%, cleanups=${stats.cleanupCount}`);
            }
            report.add();
        }

        // 生成优化建议
        const suggestions = this.generateOptimizationSuggestions();
        if (suggestions.length > 0) {
            report.add('### 内存优化建议');
            for (const suggestion of suggestions) {
                const severityIcon = suggestion.severity === 'high' ? '🚨' :
                                    suggestion.severity === 'medium' ? '⚠️' : '💡';
                report.add(`- ${severityIcon} **${suggestion.description}** - ${suggestion.recommendation}`);
            }
            report.add();
        } else {
            report.add('### 内存优化建议');
            report.add('- ✅ 内存使用状况良好，无需特殊优化建议');
            report.add();
        }

        return report.toString();
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
        this.trendAnalyzer = new TrendAnalyzer(); // 重建趋势分析器
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
     * 检查内存使用趋势
     */
    public getMemoryTrend(): MemoryTrend {
        return this.trendAnalyzer.calculateTrend();
    }

    /**
     * 预测未来内存需求
     */
    public predictMemoryRequirements(windowMs: number): number {
        return this.predictionEngine.predictMemoryUsage(windowMs);
    }

    /**
     * 提供优化建议
     */
    public generateOptimizationSuggestions(): MemoryOptimizationSuggestion[] {
        const latest = this.memoryHistory.length > 0
            ? this.memoryHistory[this.memoryHistory.length - 1]
            : { currentUsage: 0, peakUsage: this.peakUsage };

        const trend = this.trendAnalyzer.calculateTrend();

        return this.optimizationAdvisor.generateSuggestions(
            latest.currentUsage,
            latest.peakUsage,
            this.cacheStats,
            trend
        );
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

// 为了向后兼容，导出原类名
export class MemoryMonitor extends SmartMemoryMonitor {}
