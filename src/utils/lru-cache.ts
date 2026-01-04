export class LruCache<K, V> {
    private readonly maxSize: number;
    private readonly ttlMs: number;
    private entries: Map<K, { value: V; timestamp: number }> = new Map();

    constructor(maxSize: number, ttlMs: number) {
        this.maxSize = Math.max(0, maxSize);
        this.ttlMs = Math.max(0, ttlMs);
    }

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

    delete(key: K): void {
        this.entries.delete(key);
    }

    clear(): void {
        this.entries.clear();
    }

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
