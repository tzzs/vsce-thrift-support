export class LruCache<K, V> {
    private readonly maxSize: number;
    private readonly ttlMs: number;
    private entries: Map<K, { value: V; timestamp: number }> = new Map();

    /**
     * 创建 LRU 缓存。
     * @param maxSize 最大缓存条目数
     * @param ttlMs 缓存过期时间（毫秒）
     */
    constructor(maxSize: number, ttlMs: number) {
        this.maxSize = Math.max(0, maxSize);
        this.ttlMs = Math.max(0, ttlMs);
    }

    /**
     * 获取缓存值。
     * @param key 缓存键
     * @returns 缓存值，如果不存在或已过期则返回 undefined
     */
    get(key: K): V | undefined {
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

    /**
     * 设置缓存值。
     * @param key 缓存键
     * @param value 缓存值
     */
    set(key: K, value: V): void {
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

    /**
     * 删除指定键的缓存。
     * @param key 缓存键
     */
    delete(key: K): void {
        this.entries.delete(key);
    }

    /**
     * 清空所有缓存。
     */
    clear(): void {
        this.entries.clear();
    }

    /**
     * 获取当前缓存大小。
     * @returns 缓存条目数量
     */
    size(): number {
        return this.entries.size;
    }

    private evictOverflow(): void {
        while (this.entries.size > this.maxSize) {
            const oldestKey = this.entries.keys().next().value;
            if (oldestKey === undefined) {
                break;
            }
            this.entries.delete(oldestKey);
        }
    }

    private pruneExpired(now: number): void {
        if (this.ttlMs <= 0) {
            return;
        }
        for (const [key, record] of this.entries) {
            if (now - record.timestamp > this.ttlMs) {
                this.entries.delete(key);
            }
        }
    }

    private isExpired(timestamp: number): boolean {
        if (this.ttlMs <= 0) {
            return false;
        }
        return Date.now() - timestamp > this.ttlMs;
    }
}
