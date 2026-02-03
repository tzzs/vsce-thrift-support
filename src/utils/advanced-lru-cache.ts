/**
 * 高级LRU缓存接口配置
 */
export interface AdvancedCacheOptions<K = any, V = any> {
    maxSize: number;
    ttlMs: number;
    // LRU-K参数，表示考虑过去K次访问
    lruK?: number;
    // 驱逐阈值，当达到这个比例时开始主动驱逐
    evictionThreshold?: number;
    // 优先级函数
    priorityFn?: (key: K, value: V) => number;
    // 内存估算函数
    sizeEstimator?: (key: K, value: V) => number;
}

/**
 * 访问记录接口
 */
interface AccessRecord {
    timestamp: number;
    key: any;
}

/**
 * 高级LRU缓存实现，支持LRU-K算法、优先级驱逐等功能
 */
export class AdvancedLruCache<K, V> {
    private maxSize: number;
    private ttlMs: number;
    private lruK: number;
    private evictionThreshold: number;
    private priorityFn?: (key: K, value: V) => number;
    private sizeEstimator?: (key: K, value: V) => number;

    // 主要缓存存储
    private entries: Map<K, {
        value: V;
        timestamp: number;
        accessHistory: AccessRecord[];
        size: number
    }> = new Map();

    // 估算总内存使用
    private estimatedSize: number = 0;

    constructor(options: AdvancedCacheOptions<K, V>) {
        this.maxSize = Math.max(0, options.maxSize);
        this.ttlMs = Math.max(0, options.ttlMs);
        this.lruK = Math.max(1, options.lruK || 2); // 默认考虑最后2次访问
        this.evictionThreshold = Math.min(1, Math.max(0, options.evictionThreshold || 0.8)); // 默认80%
        this.priorityFn = options.priorityFn;
        this.sizeEstimator = options.sizeEstimator;
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
            this.delete(key);
            return undefined;
        }

        // 更新访问历史
        const now = Date.now();
        record.accessHistory.push({ timestamp: now, key });
        // 限制访问历史长度为lruK
        if (record.accessHistory.length > this.lruK) {
            record.accessHistory = record.accessHistory.slice(-this.lruK);
        }
        record.timestamp = now;

        return record.value;
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
        const estimatedItemSize = this.sizeEstimator ? this.sizeEstimator(key, value) : 1;

        if (this.entries.has(key)) {
            const existing = this.entries.get(key)!;
            // 减去旧项目的大小
            this.estimatedSize -= existing.size;
            this.entries.delete(key);
        }

        const proactiveLimit = this.evictionThreshold < 1
            ? Math.max(1, Math.ceil(this.maxSize * this.evictionThreshold))
            : this.maxSize;

        // 检查是否超过大小限制
        while (this.entries.size >= this.maxSize || this.entries.size >= proactiveLimit) {
            const keyToDelete = this.selectEvictionCandidate();
            if (keyToDelete === undefined) {
                break;
            }
            this.delete(keyToDelete);
        }

        // 添加新项目
        this.entries.set(key, {
            value,
            timestamp: now,
            accessHistory: [{ timestamp: now, key }],
            size: estimatedItemSize
        });
        this.estimatedSize += estimatedItemSize;

        // 定期清理过期项目
        this.pruneExpired(now);
    }

    /**
     * 删除指定键的缓存。
     * @param key 缓存键
     */
    delete(key: K): void {
        const record = this.entries.get(key);
        if (record) {
            this.estimatedSize -= record.size;
            this.entries.delete(key);
        }
    }

    /**
     * 清空所有缓存。
     */
    clear(): void {
        this.entries.clear();
        this.estimatedSize = 0;
    }

    /**
     * 获取当前缓存大小。
     * @returns 缓存条目数量
     */
    size(): number {
        return this.entries.size;
    }

    /**
     * 获取估算的内存使用量
     */
    estimatedMemoryUsage(): number {
        return this.estimatedSize;
    }

    /**
     * 获取LRU-K中最适合驱逐的候选键
     */
    private selectEvictionCandidate(): K | undefined {
        if (this.entries.size === 0) {
            return undefined;
        }

        let candidate: K | undefined;
        let lowestPriority = Infinity;
        let oldestRecentAccess = Infinity;
        let lowestAccessCount = Infinity;

        for (const [key, record] of this.entries) {
            // 计算综合驱逐分数
            const priorityScore = this.calculateEvictionScore(key, record);
            const accessCount = record.accessHistory.length;
            const recentAccess = accessCount > 0
                ? record.accessHistory[accessCount - 1].timestamp
                : record.timestamp;

            if (priorityScore < lowestPriority ||
                (priorityScore === lowestPriority && recentAccess < oldestRecentAccess) ||
                (priorityScore === lowestPriority && recentAccess === oldestRecentAccess && accessCount < lowestAccessCount)) {
                lowestPriority = priorityScore;
                oldestRecentAccess = recentAccess;
                lowestAccessCount = accessCount;
                candidate = key;
            }
        }

        return candidate;
    }

    /**
     * 计算驱逐分数（分数越低越优先驱逐）
     */
    private calculateEvictionScore(key: K, record: { value: V; timestamp: number; accessHistory: AccessRecord[]; size: number }): number {
        // 基础分数基于LRU-K逻辑
        if (record.accessHistory.length === 0) {
            return record.timestamp; // 如果没有访问历史，按时间排序
        }

        // LRU-K: 使用第k次最近访问时间作为排序依据
        const kthFromLastIndex = Math.max(0, record.accessHistory.length - this.lruK);
        const kthAccessTime = record.accessHistory[kthFromLastIndex]?.timestamp || record.timestamp;

        // 基础LRU-K分数
        let score = kthAccessTime;

        // 如果有优先级函数，考虑优先级（优先级越低越容易被驱逐）
        if (this.priorityFn) {
            const priority = this.priorityFn(key, record.value);
            // 优先级越低，驱逐分数越高（更容易被驱逐）
            score = score + (1000000 * (1 - Math.max(0, Math.min(1, priority))));
        }

        return score;
    }

    private pruneExpired(now: number): void {
        if (this.ttlMs <= 0) {
            return;
        }

        for (const [key, record] of this.entries) {
            if (this.isExpired(record.timestamp)) {
                this.delete(key);
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
