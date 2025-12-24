"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CacheManager = void 0;
class CacheManager {
    static instance;
    caches = new Map();
    configs = new Map();
    static getInstance() {
        if (!this.instance) {
            this.instance = new CacheManager();
        }
        return this.instance;
    }
    registerCache(name, config) {
        this.configs.set(name, config);
    }
    set(cacheName, key, value) {
        const config = this.configs.get(cacheName);
        if (!config) {
            throw new Error(`Cache ${cacheName} not registered`);
        }
        const cacheKey = `${cacheName}:${key}`;
        this.caches.set(cacheKey, { data: value, timestamp: Date.now() });
        this.cleanup(cacheName, config);
    }
    get(cacheName, key) {
        const cacheKey = `${cacheName}:${key}`;
        const entry = this.caches.get(cacheKey);
        if (!entry) {
            return undefined;
        }
        const config = this.configs.get(cacheName);
        if (!config) {
            return undefined;
        }
        if (Date.now() - entry.timestamp > config.ttl) {
            this.caches.delete(cacheKey);
            return undefined;
        }
        return entry.data;
    }
    clear(cacheName) {
        const prefix = `${cacheName}:`;
        for (const [key] of this.caches) {
            if (key.startsWith(prefix)) {
                this.caches.delete(key);
            }
        }
    }
    delete(cacheName, key) {
        const fullKey = `${cacheName}:${key}`;
        this.caches.delete(fullKey);
    }
    clearAll() {
        this.caches.clear();
    }
    cleanup(cacheName, config) {
        const prefix = `${cacheName}:`;
        const entries = [];
        for (const [key, value] of this.caches) {
            if (key.startsWith(prefix)) {
                entries.push([key, value]);
            }
        }
        entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
        while (entries.length > config.maxSize) {
            const [key] = entries.shift();
            this.caches.delete(key);
        }
        const now = Date.now();
        for (const [key, value] of entries) {
            if (now - value.timestamp > config.ttl) {
                this.caches.delete(key);
            }
        }
    }
}
exports.CacheManager = CacheManager;
//# sourceMappingURL=cacheManager.js.map