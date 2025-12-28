export interface CacheConfig {
    maxSize: number;
    ttl: number; // Time to live in milliseconds
}

export interface CacheEntry<T> {
    data: T;
    timestamp: number;
}

export class CacheManager {
    private static instance: CacheManager;
    private caches: Map<string, CacheEntry<any>> = new Map();
    private configs: Map<string, CacheConfig> = new Map();

    static getInstance(): CacheManager {
        if (!this.instance) {
            this.instance = new CacheManager();
        }
        return this.instance;
    }

    registerCache(name: string, config: CacheConfig): void {
        this.configs.set(name, config);
    }

    set<T>(cacheName: string, key: string, value: T): void {
        const config = this.configs.get(cacheName);
        if (!config) {
            throw new Error(`Cache ${cacheName} not registered`);
        }

        const cacheKey = `${cacheName}:${key}`;
        this.caches.set(cacheKey, {data: value, timestamp: Date.now()});

        // Clean up old entries
        this.cleanup(cacheName, config);
    }

    get<T>(cacheName: string, key: string): T | undefined {
        const cacheKey = `${cacheName}:${key}`;
        const entry = this.caches.get(cacheKey);

        if (!entry) {
            return undefined;
        }

        const config = this.configs.get(cacheName);
        if (!config) {
            return undefined;
        }

        // Check if expired
        if (Date.now() - entry.timestamp > config.ttl) {
            this.caches.delete(cacheKey);
            return undefined;
        }

        return entry.data as T;
    }

    clear(cacheName: string): void {
        const prefix = `${cacheName}:`;
        for (const [key] of this.caches) {
            if (key.startsWith(prefix)) {
                this.caches.delete(key);
            }
        }
    }

    delete(cacheName: string, key: string): void {
        const fullKey = `${cacheName}:${key}`;
        this.caches.delete(fullKey);
    }

    clearAll(): void {
        this.caches.clear();
    }

    private cleanup(cacheName: string, config: CacheConfig): void {
        const prefix = `${cacheName}:`;
        const entries: Array<[string, CacheEntry<any>]> = [];

        // Collect all entries for this cache
        for (const [key, value] of this.caches) {
            if (key.startsWith(prefix)) {
                entries.push([key, value]);
            }
        }

        // Sort by timestamp (oldest first)
        entries.sort((a, b) => a[1].timestamp - b[1].timestamp);

        // Remove oldest entries if over max size
        while (entries.length > config.maxSize) {
            const [key] = entries.shift()!;
            this.caches.delete(key);
        }

        // Remove expired entries
        const now = Date.now();
        for (const [key, value] of entries) {
            if (now - value.timestamp > config.ttl) {
                this.caches.delete(key);
            }
        }
    }
}