"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MemoryMonitor = exports.SmartMemoryMonitor = void 0;
const error_handler_1 = require("./error-handler");
const report_builder_1 = require("./report-builder");
class TrendAnalyzer {
    samples = [];
    maxSamples = 50;
    addSample(timestamp, usage) {
        this.samples.push({ timestamp, usage });
        if (this.samples.length > this.maxSamples) {
            this.samples.splice(0, this.samples.length - this.maxSamples);
        }
    }
    calculateTrend() {
        if (this.samples.length < 3) {
            return { slope: 0, stability: 'stable', period: 0 };
        }
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
        let stability;
        if (slope > 1000) {
            stability = 'increasing';
        }
        else if (slope < -1000) {
            stability = 'decreasing';
        }
        else {
            stability = 'stable';
        }
        return {
            slope,
            stability,
            period: this.samples[this.samples.length - 1].timestamp - this.samples[0].timestamp
        };
    }
    getAverageUsage() {
        if (this.samples.length === 0) {
            return 0;
        }
        const total = this.samples.reduce((sum, sample) => sum + sample.usage, 0);
        return total / this.samples.length;
    }
}
class PredictionEngine {
    trendAnalyzer;
    constructor(trendAnalyzer) {
        this.trendAnalyzer = trendAnalyzer;
    }
    predictMemoryUsage(windowMs) {
        const trend = this.trendAnalyzer.calculateTrend();
        const currentUsage = this.trendAnalyzer['samples'].length > 0
            ? this.trendAnalyzer['samples'][this.trendAnalyzer['samples'].length - 1].usage
            : 0;
        const predictedIncrease = trend.slope * (windowMs / 1000);
        return Math.max(0, currentUsage + predictedIncrease);
    }
}
class OptimizationAdvisor {
    generateSuggestions(currentUsage, peakUsage, cacheStats, trend) {
        const suggestions = [];
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
            }
            else if (usageRatio > 0.7) {
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
        if (trend.stability === 'increasing' && trend.slope > 100000) {
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
        return suggestions.sort((a, b) => this.severityScore(b.severity) - this.severityScore(a.severity));
    }
    severityScore(severity) {
        switch (severity) {
            case 'high':
                return 3;
            case 'medium':
                return 2;
            case 'low':
                return 1;
            default:
                return 0;
        }
    }
}
class SmartMemoryMonitor {
    static instance;
    memoryHistory = [];
    cacheStats = new Map();
    peakUsage = 0;
    errorHandler;
    MAX_HISTORY_SIZE = 100;
    MEMORY_CHECK_INTERVAL = 120000;
    trendAnalyzer;
    predictionEngine;
    optimizationAdvisor;
    constructor(errorHandler) {
        this.errorHandler = errorHandler ?? new error_handler_1.ErrorHandler();
        this.trendAnalyzer = new TrendAnalyzer();
        this.predictionEngine = new PredictionEngine(this.trendAnalyzer);
        this.optimizationAdvisor = new OptimizationAdvisor();
    }
    static getInstance() {
        SmartMemoryMonitor.instance ??= new SmartMemoryMonitor();
        return SmartMemoryMonitor.instance;
    }
    recordMemoryUsage() {
        const usage = this.errorHandler.safe(() => this.getCurrentMemoryUsage(), null);
        if (!usage) {
            return;
        }
        if (usage.currentUsage > this.peakUsage) {
            this.peakUsage = usage.currentUsage;
            usage.peakUsage = this.peakUsage;
        }
        this.memoryHistory.push(usage);
        if (this.memoryHistory.length > this.MAX_HISTORY_SIZE) {
            this.memoryHistory.splice(0, this.memoryHistory.length - this.MAX_HISTORY_SIZE);
        }
        this.trendAnalyzer.addSample(usage.timestamp, usage.currentUsage);
    }
    getCurrentMemoryUsage() {
        let currentUsage = 0;
        let cacheAllocated = 0;
        let cacheUsed = 0;
        if (typeof process !== 'undefined' && process.memoryUsage !== undefined) {
            const mem = process.memoryUsage();
            currentUsage = mem.heapUsed || 0;
            for (const stats of this.cacheStats.values()) {
                cacheUsed += this.estimateCacheMemoryUsage(stats);
                cacheAllocated += this.estimateCacheAllocatedMemory(stats);
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
    estimateCacheMemoryUsage(stats) {
        const avgEntrySize = 3000;
        return stats.size * avgEntrySize;
    }
    estimateCacheAllocatedMemory(stats) {
        const avgEntrySize = 3000;
        const overheadFactor = 1.2;
        return stats.maxSize * avgEntrySize * overheadFactor;
    }
    updateCacheStats(cacheName, stats) {
        const existing = this.cacheStats.get(cacheName) ?? {
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
    getMemoryReport() {
        if (this.memoryHistory.length === 0) {
            return '暂无内存使用数据';
        }
        const latest = this.memoryHistory[this.memoryHistory.length - 1];
        const avgUsage = this.memoryHistory.reduce((sum, m) => sum + m.currentUsage, 0) / this.memoryHistory.length;
        const trend = this.trendAnalyzer.calculateTrend();
        const report = new report_builder_1.ReportBuilder();
        report.add('## Thrift Support 内存使用报告');
        report.add();
        report.add(`**统计时间:** ${new Date().toLocaleString()}`);
        report.add(`**当前内存使用:** ${(0, report_builder_1.formatMb)(latest.currentUsage)}`);
        report.add(`**内存使用峰值:** ${(0, report_builder_1.formatMb)(latest.peakUsage)}`);
        report.add(`**平均内存使用:** ${(0, report_builder_1.formatMb)(avgUsage)}`);
        report.add(`**缓存估算使用:** ${(0, report_builder_1.formatMb)(latest.cacheUsed)}`);
        report.add(`**缓存估算分配:** ${(0, report_builder_1.formatMb)(latest.cacheAllocated)}`);
        report.add(`**内存趋势:** ${trend.stability} (变化率: ${trend.slope.toFixed(2)} bytes/sec)`);
        report.add();
        if (this.cacheStats.size > 0) {
            report.add('### 缓存统计');
            for (const [name, stats] of this.cacheStats) {
                report.add(`- **${name}**: size=${stats.size}/${stats.maxSize}, hitRate=${(stats.hitRate * 100).toFixed(1)}%, cleanups=${stats.cleanupCount}`);
            }
            report.add();
        }
        const suggestions = this.generateOptimizationSuggestions();
        if (suggestions.length > 0) {
            report.add('### 内存优化建议');
            for (const suggestion of suggestions) {
                const severityIcon = suggestion.severity === 'high' ? '🚨' :
                    suggestion.severity === 'medium' ? '⚠️' : '💡';
                report.add(`- ${severityIcon} **${suggestion.description}** - ${suggestion.recommendation}`);
            }
            report.add();
        }
        else {
            report.add('### 内存优化建议');
            report.add('- ✅ 内存使用状况良好，无需特殊优化建议');
            report.add();
        }
        return report.toString();
    }
    getMemoryTrendData() {
        return this.memoryHistory.map(usage => ({
            operation: 'memory-usage',
            duration: usage.currentUsage,
            timestamp: usage.timestamp,
            documentUri: 'memory'
        }));
    }
    forceGarbageCollection() {
        if (global.gc) {
            global.gc();
            this.recordMemoryUsage();
        }
    }
    clearMemoryHistory() {
        this.memoryHistory = [];
        this.trendAnalyzer = new TrendAnalyzer();
    }
    isHighMemoryUsage(thresholdRatio = 0.8) {
        if (this.memoryHistory.length === 0) {
            return false;
        }
        const latest = this.memoryHistory[this.memoryHistory.length - 1];
        return latest.peakUsage > 0 && (latest.currentUsage / latest.peakUsage) > thresholdRatio;
    }
    getMemoryTrend() {
        return this.trendAnalyzer.calculateTrend();
    }
    predictMemoryRequirements(windowMs) {
        return this.predictionEngine.predictMemoryUsage(windowMs);
    }
    generateOptimizationSuggestions() {
        const latest = this.memoryHistory.length > 0
            ? this.memoryHistory[this.memoryHistory.length - 1]
            : { currentUsage: 0, peakUsage: this.peakUsage };
        const trend = this.trendAnalyzer.calculateTrend();
        return this.optimizationAdvisor.generateSuggestions(latest.currentUsage, latest.peakUsage, this.cacheStats, trend);
    }
    getAllCacheStats() {
        return new Map(this.cacheStats);
    }
    getCurrentUsage() {
        if (this.memoryHistory.length === 0) {
            return 0;
        }
        return this.memoryHistory[this.memoryHistory.length - 1].currentUsage;
    }
    getPeakUsage() {
        return this.peakUsage;
    }
}
exports.SmartMemoryMonitor = SmartMemoryMonitor;
class MemoryMonitor extends SmartMemoryMonitor {
}
exports.MemoryMonitor = MemoryMonitor;
//# sourceMappingURL=memory-monitor.js.map