"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LruCache = exports.AdvancedLruCache = void 0;
class AdvancedLruCache {
    maxSize;
    ttlMs;
    lruK;
    evictionThreshold;
    priorityFn;
    sizeEstimator;
    entries = new Map();
    totalEstimatedSize = 0;
    constructor(options) {
        this.maxSize = Math.max(0, options.maxSize);
        this.ttlMs = Math.max(0, options.ttlMs);
        this.lruK = options.lruK ?? 2;
        this.evictionThreshold = options.evictionThreshold ?? 0.8;
        this.priorityFn = options.priorityFn;
        this.sizeEstimator = options.sizeEstimator;
    }
    get(key) {
        const record = this.entries.get(key);
        if (!record) {
            return undefined;
        }
        if (this.isExpired(record.timestamp)) {
            this.entries.delete(key);
            this.totalEstimatedSize -= record.estimatedSize;
            return undefined;
        }
        const now = Date.now();
        const updatedAccessTimes = [...record.accessTimes, now].slice(-this.lruK);
        const updatedAccessCount = record.accessCount + 1;
        let priority;
        if (this.priorityFn) {
            priority = this.priorityFn(key, record.value);
        }
        this.entries.delete(key);
        this.entries.set(key, {
            ...record,
            timestamp: now,
            accessTimes: updatedAccessTimes,
            accessCount: updatedAccessCount,
            priority
        });
        return record.value;
    }
    set(key, value) {
        if (this.maxSize === 0) {
            return;
        }
        const now = Date.now();
        let estimatedSize = 1;
        if (this.sizeEstimator) {
            estimatedSize = this.sizeEstimator(key, value);
        }
        let priority;
        if (this.priorityFn) {
            priority = this.priorityFn(key, value);
        }
        const existing = this.entries.get(key);
        if (existing) {
            this.totalEstimatedSize -= existing.estimatedSize;
            this.entries.delete(key);
        }
        this.entries.set(key, {
            value,
            timestamp: now,
            accessTimes: [now],
            accessCount: 1,
            priority,
            estimatedSize
        });
        this.totalEstimatedSize += estimatedSize;
        this.pruneExpired(now);
        if (this.entries.size > this.maxSize * this.evictionThreshold) {
            this.evictOverflow();
        }
    }
    delete(key) {
        const record = this.entries.get(key);
        if (record) {
            this.totalEstimatedSize -= record.estimatedSize;
        }
        this.entries.delete(key);
    }
    clear() {
        this.entries.clear();
        this.totalEstimatedSize = 0;
    }
    size() {
        return this.entries.size;
    }
    has(key) {
        return this.entries.has(key);
    }
    estimatedSize() {
        return this.totalEstimatedSize;
    }
    utilization() {
        if (this.maxSize === 0) {
            return 0;
        }
        return this.entries.size / this.maxSize;
    }
    evictOverflow() {
        const thresholdSize = Math.max(1, Math.min(this.maxSize, Math.floor(this.maxSize * this.evictionThreshold)));
        while (this.entries.size > thresholdSize) {
            const keyToRemove = this.selectKeyForEviction();
            if (keyToRemove === undefined) {
                break;
            }
            const record = this.entries.get(keyToRemove);
            if (record) {
                this.totalEstimatedSize -= record.estimatedSize;
            }
            this.entries.delete(keyToRemove);
        }
    }
    selectKeyForEviction() {
        const entriesArray = Array.from(this.entries.entries());
        if (entriesArray.some(([, item]) => item.priority !== undefined)) {
            const lowestPriorityEntry = entriesArray.reduce((lowest, current) => {
                const currentPriority = current[1].priority ?? Number.POSITIVE_INFINITY;
                const lowestPriority = lowest[1].priority ?? Number.POSITIVE_INFINITY;
                if (currentPriority === lowestPriority) {
                    const currentLatestAccess = Math.max(...current[1].accessTimes);
                    const lowestLatestAccess = Math.max(...lowest[1].accessTimes);
                    return currentLatestAccess < lowestLatestAccess ? current : lowest;
                }
                return currentPriority < lowestPriority ? current : lowest;
            });
            return lowestPriorityEntry[0];
        }
        let oldestKey;
        let oldestTime = Infinity;
        for (const [key, item] of this.entries) {
            const latestAccess = Math.max(...item.accessTimes);
            if (latestAccess < oldestTime) {
                oldestTime = latestAccess;
                oldestKey = key;
            }
        }
        return oldestKey;
    }
    pruneExpired(now) {
        if (this.ttlMs <= 0) {
            return;
        }
        const expiredKeys = [];
        for (const [key, record] of this.entries) {
            if (this.isExpired(record.timestamp, now)) {
                expiredKeys.push(key);
                this.totalEstimatedSize -= record.estimatedSize;
            }
        }
        for (const key of expiredKeys) {
            this.entries.delete(key);
        }
    }
    isExpired(timestamp, now = Date.now()) {
        if (this.ttlMs <= 0) {
            return false;
        }
        return now - timestamp > this.ttlMs;
    }
}
exports.AdvancedLruCache = AdvancedLruCache;
class LruCache {
    maxSize;
    ttlMs;
    entries = new Map();
    constructor(maxSize, ttlMs) {
        this.maxSize = Math.max(0, maxSize);
        this.ttlMs = Math.max(0, ttlMs);
    }
    get(key) {
        const record = this.entries.get(key);
        if (!record) {
            return undefined;
        }
        if (this.isExpired(record.timestamp)) {
            this.entries.delete(key);
            return undefined;
        }
        this.entries.delete(key);
        const refreshed = { value: record.value, timestamp: Date.now() };
        this.entries.set(key, refreshed);
        return refreshed.value;
    }
    set(key, value) {
        if (this.maxSize === 0) {
            return;
        }
        const now = Date.now();
        if (this.entries.has(key)) {
            this.entries.delete(key);
        }
        this.entries.set(key, { value, timestamp: now });
        this.pruneExpired(now);
        this.evictOverflow();
    }
    delete(key) {
        this.entries.delete(key);
    }
    clear() {
        this.entries.clear();
    }
    size() {
        return this.entries.size;
    }
    evictOverflow() {
        while (this.entries.size > this.maxSize) {
            let deleted = false;
            for (const key of this.entries.keys()) {
                this.entries.delete(key);
                deleted = true;
                break;
            }
            if (!deleted) {
                break;
            }
        }
    }
    pruneExpired(now) {
        if (this.ttlMs <= 0) {
            return;
        }
        for (const [key, record] of this.entries) {
            if (now - record.timestamp > this.ttlMs) {
                this.entries.delete(key);
            }
        }
    }
    isExpired(timestamp) {
        if (this.ttlMs <= 0) {
            return false;
        }
        return Date.now() - timestamp > this.ttlMs;
    }
}
exports.LruCache = LruCache;
//# sourceMappingURL=optimized-lru-cache.js.map