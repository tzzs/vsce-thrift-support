"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CacheManager = exports.MemoryAwareCacheManager = void 0;
const memory_monitor_1 = require("./memory-monitor");
const optimized_lru_cache_1 = require("./optimized-lru-cache");
class MemoryAwareCacheManager {
    static instance;
    caches = new Map();
    configs = new Map();
    MEMORY_MONITORING_ENABLED = true;
    cleanupCount = new Map();
    lastCleanup = new Map();
    hitCount = new Map();
    memoryPressureLevel = 'normal';
    lastMemoryCheck = 0;
    memoryCheckInterval = 30000;
    gcThreshold = 0.8;
    dynamicAdjustmentFactor = 1.0;
    static getInstance() {
        this.instance ??= new MemoryAwareCacheManager();
        return this.instance;
    }
    registerCache(name, config) {
        this.configs.set(name, config);
        const cacheOptions = {
            maxSize: config.maxSize,
            ttlMs: config.ttl,
            lruK: config.lruK,
            evictionThreshold: config.evictionThreshold,
            priorityFn: config.priorityFn,
            sizeEstimator: config.sizeEstimator
        };
        const cache = new optimized_lru_cache_1.AdvancedLruCache(cacheOptions);
        this.caches.set(name, cache);
        this.cleanupCount.set(name, 0);
        this.lastCleanup.set(name, 0);
        this.hitCount.set(name, { hits: 0, misses: 0 });
    }
    set(cacheName, key, value) {
        const cache = this.caches.get(cacheName);
        if (!cache) {
            throw new Error(`Cache ${cacheName} not registered`);
        }
        const sizeBefore = cache.size();
        const hadKey = cache.has(key);
        const expectedSize = hadKey ? sizeBefore : sizeBefore + 1;
        cache.set(key, value);
        const sizeAfter = cache.size();
        if (sizeAfter < expectedSize) {
            const count = this.cleanupCount.get(cacheName) ?? 0;
            this.cleanupCount.set(cacheName, count + 1);
            this.lastCleanup.set(cacheName, Date.now());
        }
        this.checkAndAdjustForMemoryPressure();
        this.updateMemoryMonitor();
    }
    get(cacheName, key) {
        const cache = this.caches.get(cacheName);
        if (!cache) {
            this.recordMiss(cacheName);
            return undefined;
        }
        const result = cache.get(key);
        if (result !== undefined) {
            this.recordHit(cacheName);
        }
        else {
            this.recordMiss(cacheName);
        }
        this.updateMemoryMonitor();
        return result;
    }
    clear(cacheName) {
        const cache = this.caches.get(cacheName);
        if (cache) {
            cache.clear();
        }
        this.updateMemoryMonitor();
    }
    delete(cacheName, key) {
        const cache = this.caches.get(cacheName);
        if (cache) {
            cache.delete(key);
        }
        this.updateMemoryMonitor();
    }
    clearAll() {
        this.caches.forEach(cache => cache.clear());
        this.cleanupCount.clear();
        this.lastCleanup.clear();
        this.hitCount.clear();
        this.updateMemoryMonitor();
    }
    checkAndAdjustForMemoryPressure() {
        const now = Date.now();
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
            }
            else if (usageRatio > 0.7) {
                this.memoryPressureLevel = 'medium';
                this.performModerateCleanup();
            }
            else {
                this.memoryPressureLevel = 'normal';
            }
        }
    }
    adjustCacheCapacity(memoryUsage) {
        const peakUsage = this.getPeakUsageEstimate();
        if (peakUsage > 0) {
            const usageRatio = memoryUsage / peakUsage;
            for (const [cacheName] of this.caches.entries()) {
                const config = this.configs.get(cacheName);
                if (config) {
                    let adjustedMaxSize = config.maxSize;
                    if (usageRatio > 0.85) {
                        adjustedMaxSize = Math.floor(config.maxSize * 0.5 * this.dynamicAdjustmentFactor);
                    }
                    else if (usageRatio > 0.7) {
                        adjustedMaxSize = Math.floor(config.maxSize * 0.7 * this.dynamicAdjustmentFactor);
                    }
                    else if (usageRatio < 0.5) {
                        adjustedMaxSize = Math.min(Math.floor(config.maxSize * 1.2 * this.dynamicAdjustmentFactor), config.maxSize * 2);
                    }
                    const newConfig = {
                        ...config,
                        maxSize: Math.max(1, adjustedMaxSize)
                    };
                    this.registerCache(cacheName, newConfig);
                }
            }
        }
    }
    getPeakUsageEstimate() {
        let estimatedPeak = 0;
        for (const [cacheName] of this.caches.entries()) {
            const config = this.configs.get(cacheName);
            if (config) {
                estimatedPeak += config.maxSize * 1024;
            }
        }
        return estimatedPeak;
    }
    performAggressiveCleanup() {
        for (const [cacheName, cache] of this.caches.entries()) {
            const config = this.configs.get(cacheName);
            if (config) {
                const currentSize = cache.size();
                if (currentSize > config.maxSize * 0.6) {
                }
            }
        }
    }
    performModerateCleanup() {
        for (const [cacheName, cache] of this.caches.entries()) {
            void cacheName;
            if (cache.size() > 0) {
            }
        }
    }
    recordHit(cacheName) {
        const stats = this.hitCount.get(cacheName) ?? { hits: 0, misses: 0 };
        stats.hits++;
        this.hitCount.set(cacheName, stats);
    }
    recordMiss(cacheName) {
        const stats = this.hitCount.get(cacheName) ?? { hits: 0, misses: 0 };
        stats.misses++;
        this.hitCount.set(cacheName, stats);
    }
    getCacheStats(cacheName) {
        const cache = this.caches.get(cacheName);
        const config = this.configs.get(cacheName);
        const cleanup = this.cleanupCount.get(cacheName) ?? 0;
        const stats = this.hitCount.get(cacheName) ?? { hits: 0, misses: 0 };
        const totalAccesses = stats.hits + stats.misses;
        const hitRate = totalAccesses > 0 ? stats.hits / totalAccesses : 0;
        return {
            size: cache?.size() ?? 0,
            maxSize: config?.maxSize ?? 0,
            hitRate,
            cleanupCount: cleanup
        };
    }
    getAllCacheStats() {
        const allStats = new Map();
        for (const [cacheName] of this.caches) {
            allStats.set(cacheName, this.getCacheStats(cacheName));
        }
        return allStats;
    }
    updateMemoryMonitor() {
        if (!this.MEMORY_MONITORING_ENABLED) {
            return;
        }
        const memoryMonitor = this.getMemoryMonitor();
        if (!memoryMonitor) {
            return;
        }
        for (const [cacheName] of this.caches.entries()) {
            const stats = this.getCacheStats(cacheName);
            const lastCleanup = this.lastCleanup.get(cacheName) ?? 0;
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
    getMemoryMonitor() {
        try {
            return memory_monitor_1.MemoryMonitor.getInstance();
        }
        catch {
            return null;
        }
    }
    getMemoryPressureLevel() {
        return this.memoryPressureLevel;
    }
    setDynamicAdjustmentFactor(factor) {
        this.dynamicAdjustmentFactor = factor;
    }
    getCacheUtilization() {
        const utilizationMap = new Map();
        for (const [cacheName, cache] of this.caches.entries()) {
            const config = this.configs.get(cacheName);
            if (config && config.maxSize > 0) {
                utilizationMap.set(cacheName, cache.utilization());
            }
        }
        return utilizationMap;
    }
}
exports.MemoryAwareCacheManager = MemoryAwareCacheManager;
class CacheManager extends MemoryAwareCacheManager {
}
exports.CacheManager = CacheManager;
//# sourceMappingURL=cache-manager.js.map