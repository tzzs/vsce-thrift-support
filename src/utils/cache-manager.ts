/**
 * 缓存配置项。
 */
export interface CacheConfig {
    maxSize: number;
    ttl: number; // Time to live in milliseconds
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
 * CacheManager：统一缓存注册与读写。
 */
export class CacheManager {
    private static instance: CacheManager;
    private caches: Map<string, Map<string, CacheEntry<any>>> = new Map();
    private configs: Map<string, CacheConfig> = new Map();

    // 添加内存监控集成
    private readonly MEMORY_MONITORING_ENABLED = true;
    private cleanupCount: Map<string, number> = new Map();
    private lastCleanup: Map<string, number> = new Map();
    private hitCount: Map<string, { hits: number; misses: number }> = new Map();

    /**
     * 获取单例实例。
     * @returns {CacheManager} CacheManager 单例
     */
    static getInstance(): CacheManager {
        if (!this.instance) {
            this.instance = new CacheManager();
        }
        return this.instance;
    }

    /**
     * 注册缓存配置。
     * @param name 缓存名称
     * @param config 缓存配置（最大大小、TTL）
     */
    registerCache(name: string, config: CacheConfig): void {
        this.configs.set(name, config);
        if (!this.caches.has(name)) {
            this.caches.set(name, new Map());
        }
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
        const config = this.configs.get(cacheName);
        if (!config) {
            throw new Error(`Cache ${cacheName} not registered`);
        }

        const cache = this.getCache(cacheName);
        if (cache.has(key)) {
            cache.delete(key);
        }
        cache.set(key, {data: value, timestamp: Date.now()});

        // Clean up old entries
        const didCleanup = this.cleanup(cache, config);

        if (didCleanup) {
            const count = this.cleanupCount.get(cacheName) || 0;
            this.cleanupCount.set(cacheName, count + 1);
            this.lastCleanup.set(cacheName, Date.now());
        }

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
        const entry = cache.get(key);

        if (!entry) {
            this.recordMiss(cacheName);
            return undefined;
        }

        const config = this.configs.get(cacheName);
        if (!config) {
            this.recordMiss(cacheName);
            return undefined;
        }

        // Check if expired
        if (Date.now() - entry.timestamp > config.ttl) {
            cache.delete(key);
            this.recordMiss(cacheName);
            return undefined;
        }

        this.recordHit(cacheName);

        // Update memory monitor if available
        this.updateMemoryMonitor();

        return entry.data as T;
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

    private getCache(cacheName: string): Map<string, CacheEntry<any>> {
        let cache = this.caches.get(cacheName);
        if (!cache) {
            cache = new Map();
            this.caches.set(cacheName, cache);
        }
        return cache;
    }

    private cleanup(cache: Map<string, CacheEntry<any>>, config: CacheConfig): boolean {
        let removed = false;
        const now = Date.now();
        for (const [key, value] of cache) {
            if (now - value.timestamp > config.ttl) {
                cache.delete(key);
                removed = true;
            }
        }

        while (cache.size > config.maxSize) {
            const oldestKey = cache.keys().next().value;
            if (oldestKey === undefined) {
                break;
            }
            cache.delete(oldestKey);
            removed = true;
        }
        return removed;
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
            size: cache?.size || 0,
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

        // 尝试更新内存监控，延迟导入避免循环依赖
        try {
            const module = require('./memory-monitor');
            const memoryMonitor = module.MemoryMonitor.getInstance();

            for (const [cacheName] of this.caches) {
                const stats = this.getCacheStats(cacheName);
                const lastCleanup = this.lastCleanup.get(cacheName) || 0;
                memoryMonitor.updateCacheStats(cacheName, {
                    size: stats.size,
                    maxSize: stats.maxSize,
                    hitRate: stats.hitRate,
                    cleanupCount: stats.cleanupCount,
                    lastCleanup
                });
            }
        } catch (err) {
            // 忽略错误，避免模块未找到时的问题
        }
    }
}
