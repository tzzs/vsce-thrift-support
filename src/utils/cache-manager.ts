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
        cache.set(key, { data: value, timestamp: Date.now() });

        // Clean up old entries
        this.cleanup(cache, config);
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
            return undefined;
        }
        const entry = cache.get(key);

        if (!entry) {
            return undefined;
        }

        const config = this.configs.get(cacheName);
        if (!config) {
            return undefined;
        }

        // Check if expired
        if (Date.now() - entry.timestamp > config.ttl) {
            cache.delete(key);
            return undefined;
        }

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
    }

    /**
     * 删除指定键。
     */
    delete(cacheName: string, key: string): void {
        const cache = this.caches.get(cacheName);
        if (cache) {
            cache.delete(key);
        }
    }

    /**
     * 清空所有缓存。
     */
    clearAll(): void {
        this.caches.forEach(cache => cache.clear());
    }

    private getCache(cacheName: string): Map<string, CacheEntry<any>> {
        let cache = this.caches.get(cacheName);
        if (!cache) {
            cache = new Map();
            this.caches.set(cacheName, cache);
        }
        return cache;
    }

    private cleanup(cache: Map<string, CacheEntry<any>>, config: CacheConfig): void {
        const now = Date.now();
        for (const [key, value] of cache) {
            if (now - value.timestamp > config.ttl) {
                cache.delete(key);
            }
        }

        while (cache.size > config.maxSize) {
            const oldestKey = cache.keys().next().value;
            if (oldestKey === undefined) {
                break;
            }
            cache.delete(oldestKey);
        }
    }
}
