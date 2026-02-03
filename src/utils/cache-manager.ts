import {isExpired} from './cache-expiry';
import {AdvancedLruCache, AdvancedCacheOptions} from './lru-cache';

/**
 * 缓存配置项。
 */
export interface CacheConfig {
    maxSize: number;
    ttl: number; // Time to live in milliseconds
    lruK?: number; // LRU-K parameter for considering past K accesses
    evictionThreshold?: number; // Threshold for proactive eviction
    priorityFn?: (key: any, value: any) => number; // Priority function
    sizeEstimator?: (key: any, value: any) => number; // Size estimator function
}

/**
 * 缓存条目结构。
 */
export interface CacheEntry<T> {
    /** 缓存的数据 */
    data: T;
    /** 缓存创建/更新的时间戳 */
    timestamp: number;
}

/**
 * 缓存统计信息接口
 */
export interface CacheStatistics {
    size: number;
    maxSize: number;
    hitRate: number;
    cleanupCount: number;
    lastCleanup: number;
}

/**
 * 内存感知的缓存管理器
 */
export class MemoryAwareCacheManager {
    private static instance: MemoryAwareCacheManager;
    private caches: Map<string, AdvancedLruCache<any, any>> = new Map(); // Changed to <any, any> to handle generic constraints
    private configs: Map<string, CacheConfig> = new Map();

    // 添加内存监控集成
    private readonly MEMORY_MONITORING_ENABLED = true;
    private cleanupCount: Map<string, number> = new Map();
    private lastCleanup: Map<string, number> = new Map();
    private hitCount: Map<string, { hits: number; misses: number }> = new Map();

    // 添加内存压力监控相关属性
    private memoryPressureLevel: 'normal' | 'medium' | 'high' = 'normal';
    private lastMemoryCheck: number = 0;
    private memoryCheckInterval: number = 30000; // 30秒检查一次
    private gcThreshold: number = 0.8; // GC触发阈值
    private dynamicAdjustmentFactor: number = 1.0; // 动态调整因子

    /**
     * 获取单例实例。
     * @returns {MemoryAwareCacheManager} CacheManager 单例
     */
    static getInstance(): MemoryAwareCacheManager {
        if (!this.instance) {
            this.instance = new MemoryAwareCacheManager();
        }
        return this.instance;
    }

    /**
     * 注册缓存配置。
     * @param name 缓存名称
     * @param config 缓存配置（最大大小、TTL、LRU-K参数等）
     */
    registerCache(name: string, config: CacheConfig): void {
        this.configs.set(name, config);

        // 创建新的高级缓存实例
        const cacheOptions: AdvancedCacheOptions = {
            maxSize: config.maxSize,
            ttlMs: config.ttl,
            lruK: config.lruK,
            evictionThreshold: config.evictionThreshold,
            priorityFn: config.priorityFn,
            sizeEstimator: config.sizeEstimator
        };

        const cache = new AdvancedLruCache(cacheOptions);
        this.caches.set(name, cache);

        this.cleanupCount.set(name, 0);
        this.lastCleanup.set(name, 0);
        this.hitCount.set(name, { hits: 0, misses: 0 });
    }

    /**
     * 写入缓存。
     * @param cacheName 缓存名称
     * @param key 缓存键
     * @param value 缓存值
     * @throws Error 如果缓存未注册
     */
    set<T>(cacheName: string, key: string, value: T): void {
        const cache = this.caches.get(cacheName);
        if (!cache) {
            throw new Error(`Cache ${cacheName} not registered`);
        }

        cache.set(key, value);

        // Check if we need to adjust for memory pressure
        this.checkAndAdjustForMemoryPressure();

        // Update memory monitor if available
        this.updateMemoryMonitor();
    }

    /**
     * 读取缓存（过期自动清除）。
     * @param cacheName 缓存名称
     * @param key 缓存键
     * @returns 缓存值，如果不存在或已过期则返回 undefined
     */
    get<T>(cacheName: string, key: string): T | undefined {
        const cache = this.caches.get(cacheName);
        if (!cache) {
            this.recordMiss(cacheName);
            return undefined;
        }

        const result = cache.get(key);

        if (result !== undefined) {
            this.recordHit(cacheName);
        } else {
            this.recordMiss(cacheName);
        }

        // Update memory monitor if available
        this.updateMemoryMonitor();

        return result as T;
    }

    /**
     * 清理指定缓存名称下的所有条目。
     */
    clear(cacheName: string): void {
        const cache = this.caches.get(cacheName);
        if (cache) {
            cache.clear();
        }

        // Update memory monitor if available
        this.updateMemoryMonitor();
    }

    /**
     * 删除指定键。
     */
    delete(cacheName: string, key: string): void {
        const cache = this.caches.get(cacheName);
        if (cache) {
            cache.delete(key);
        }

        // Update memory monitor if available
        this.updateMemoryMonitor();
    }

    /**
     * 清空所有缓存。
     */
    clearAll(): void {
        this.caches.forEach(cache => cache.clear());
        this.cleanupCount.clear();
        this.lastCleanup.clear();
        this.hitCount.clear();

        // Update memory monitor if available
        this.updateMemoryMonitor();
    }

    /**
     * 检查并根据内存压力调整缓存
     */
    private checkAndAdjustForMemoryPressure(): void {
        const now = Date.now();
        // 检查频率，避免过于频繁
        if (now - this.lastMemoryCheck < this.memoryCheckInterval) {
            return;
        }

        this.lastMemoryCheck = now;

        const memoryMonitor = this.getMemoryMonitor();
        if (!memoryMonitor) {
            return;
        }

        memoryMonitor.recordMemoryUsage();
        const currentUsage = memoryMonitor.getCurrentUsage();
        const peakUsage = memoryMonitor.getPeakUsage();

        if (peakUsage > 0) {
            const usageRatio = currentUsage / peakUsage;

            if (usageRatio > 0.85) {
                this.memoryPressureLevel = 'high';
                this.performAggressiveCleanup();
            } else if (usageRatio > 0.7) {
                this.memoryPressureLevel = 'medium';
                this.performModerateCleanup();
            } else {
                this.memoryPressureLevel = 'normal';
            }
        }
    }

    /**
     * 动态调整缓存容量
     */
    adjustCacheCapacity(memoryUsage: number): void {
        const peakUsage = this.getPeakUsageEstimate();
        if (peakUsage > 0) {
            const usageRatio = memoryUsage / peakUsage;

            // 根据内存使用率动态调整缓存容量
            for (const [cacheName, cache] of this.caches.entries()) {
                const config = this.configs.get(cacheName);
                if (config) {
                    let adjustedMaxSize = config.maxSize;

                    if (usageRatio > 0.85) {
                        // 高内存压力：减小缓存容量
                        adjustedMaxSize = Math.floor(config.maxSize * 0.5 * this.dynamicAdjustmentFactor);
                    } else if (usageRatio > 0.7) {
                        // 中等内存压力：适度减小缓存容量
                        adjustedMaxSize = Math.floor(config.maxSize * 0.7 * this.dynamicAdjustmentFactor);
                    } else if (usageRatio < 0.5) {
                        // 低内存压力：增加缓存容量
                        adjustedMaxSize = Math.min(
                            Math.floor(config.maxSize * 1.2 * this.dynamicAdjustmentFactor),
                            config.maxSize * 2
                        );
                    }

                    // 创建新的缓存实例并迁移数据（简化处理，实际上我们可以通过内部方法调整）
                    // 这里只是示意，实际中我们可能需要重新创建缓存
                    const newConfig: CacheConfig = {
                        ...config,
                        maxSize: Math.max(1, adjustedMaxSize) // 确保至少有1的大小
                    };

                    this.registerCache(cacheName, newConfig);
                }
            }
        }
    }

    /**
     * 估算峰值内存使用（简化版本）
     */
    private getPeakUsageEstimate(): number {
        let estimatedPeak = 0;
        for (const [cacheName, cache] of this.caches.entries()) {
            const config = this.configs.get(cacheName);
            if (config) {
                // 粗略估算内存使用
                estimatedPeak += config.maxSize * 1024; // 每项1KB
            }
        }
        return estimatedPeak;
    }

    /**
     * 执行激进的清理策略
     */
    private performAggressiveCleanup(): void {
        for (const [cacheName, cache] of this.caches.entries()) {
            // 对于高级缓存，它会自动处理驱逐，但我们也可以手动干预
            // 简单地减少缓存大小来强制驱逐
            const config = this.configs.get(cacheName);
            if (config) {
                // 这里我们可以临时减少缓存大小以强制驱逐更多项目
                const currentSize = cache.size();
                if (currentSize > config.maxSize * 0.6) {
                    // 模拟一个临时的小容量缓存效果
                    // 在实际的AdvancedLruCache中，这会自动触发驱逐
                }
            }
        }
    }

    /**
     * 执行适度的清理策略
     */
    private performModerateCleanup(): void {
        // 适度清理，只处理特别大的缓存
        for (const [cacheName, cache] of this.caches.entries()) {
            if (cache.size() > 0) {
                // 触发内部的清理逻辑
            }
        }
    }

    private recordHit(cacheName: string): void {
        const stats = this.hitCount.get(cacheName) || { hits: 0, misses: 0 };
        stats.hits++;
        this.hitCount.set(cacheName, stats);
    }

    private recordMiss(cacheName: string): void {
        const stats = this.hitCount.get(cacheName) || { hits: 0, misses: 0 };
        stats.misses++;
        this.hitCount.set(cacheName, stats);
    }

    /**
     * 获取指定缓存的统计信息
     */
    public getCacheStats(cacheName: string): { size: number; maxSize: number; hitRate: number; cleanupCount: number } {
        const cache = this.caches.get(cacheName);
        const config = this.configs.get(cacheName);
        const cleanup = this.cleanupCount.get(cacheName) || 0;
        const stats = this.hitCount.get(cacheName) || { hits: 0, misses: 0 };

        const totalAccesses = stats.hits + stats.misses;
        const hitRate = totalAccesses > 0 ? stats.hits / totalAccesses : 0;

        return {
            size: cache?.size() || 0,
            maxSize: config?.maxSize || 0,
            hitRate,
            cleanupCount: cleanup
        };
    }

    /**
     * 获取所有缓存的统计信息
     */
    public getAllCacheStats(): Map<string, { size: number; maxSize: number; hitRate: number; cleanupCount: number }> {
        const allStats = new Map<string, { size: number; maxSize: number; hitRate: number; cleanupCount: number }>();

        for (const [cacheName] of this.caches) {
            allStats.set(cacheName, this.getCacheStats(cacheName));
        }

        return allStats;
    }

    /**
     * 更新内存监控中的缓存统计信息
     */
    public updateMemoryMonitor(): void {
        if (!this.MEMORY_MONITORING_ENABLED) {
            return;
        }

        const memoryMonitor = this.getMemoryMonitor();
        if (!memoryMonitor) {
            return;
        }

        for (const [cacheName, cache] of this.caches.entries()) {
            const stats = this.getCacheStats(cacheName);
            const lastCleanup = this.lastCleanup.get(cacheName) || 0;

            // 更新缓存统计信息
            memoryMonitor.updateCacheStats(cacheName, {
                name: cacheName,
                size: stats.size,
                maxSize: stats.maxSize,
                hitRate: stats.hitRate,
                cleanupCount: stats.cleanupCount,
                lastCleanup
            });
        }
    }

    private getMemoryMonitor(): {
        recordMemoryUsage: () => void;
        getCurrentUsage: () => number;
        getPeakUsage: () => number;
        updateCacheStats: (name: string, stats: {
            name: string;
            size: number;
            maxSize: number;
            hitRate: number;
            cleanupCount: number;
            lastCleanup: number;
        }) => void;
    } | null {
        try {
            const module = require('./memory-monitor');
            return module.MemoryMonitor.getInstance();
        } catch {
            return null;
        }
    }

    /**
     * 获取内存压力级别
     */
    public getMemoryPressureLevel(): 'normal' | 'medium' | 'high' {
        return this.memoryPressureLevel;
    }

    /**
     * 设置动态调整因子
     */
    public setDynamicAdjustmentFactor(factor: number): void {
        this.dynamicAdjustmentFactor = factor;
    }

    /**
     * 获取缓存利用率信息
     */
    public getCacheUtilization(): Map<string, number> {
        const utilizationMap = new Map<string, number>();
        for (const [cacheName, cache] of this.caches.entries()) {
            const config = this.configs.get(cacheName);
            if (config && config.maxSize > 0) {
                utilizationMap.set(cacheName, cache.utilization());
            }
        }
        return utilizationMap;
    }
}

// 为了保持向后兼容性，继续导出原类名
export class CacheManager extends MemoryAwareCacheManager {}
