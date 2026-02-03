export interface AdvancedCacheOptions {
    maxSize: number;
    ttlMs: number;
    // LRU-K参数，表示考虑过去K次访问
    lruK?: number;
    // 驱逐阈值，当达到这个比例时开始主动驱逐
    evictionThreshold?: number;
    // 优先级函数
    priorityFn?: (key: any, value: any) => number;
    // 内存估算函数
    sizeEstimator?: (key: any, value: any) => number;
}

interface CacheItem<V> {
    value: V;
    timestamp: number;
    accessTimes: number[]; // 用于LRU-K算法，记录最近K次访问时间
    accessCount: number;   // 用于LFU算法，记录访问次数
    priority?: number;     // 优先级
    estimatedSize: number; // 估算的内存大小
}

export class AdvancedLruCache<K, V> {
    private readonly maxSize: number;
    private readonly ttlMs: number;
    private readonly lruK: number;
    private readonly evictionThreshold: number;
    private readonly priorityFn?: (key: K, value: V) => number;
    private readonly sizeEstimator?: (key: K, value: V) => number;

    private entries: Map<K, CacheItem<V>> = new Map();
    private totalEstimatedSize: number = 0;

    /**
     * 创建高级LRU缓存，支持LRU-K和优先级功能。
     * @param options 缓存配置选项
     */
    constructor(options: AdvancedCacheOptions) {
        this.maxSize = Math.max(0, options.maxSize);
        this.ttlMs = Math.max(0, options.ttlMs);
        this.lruK = options.lruK ?? 2; // 默认为2，考虑最近2次访问
        this.evictionThreshold = options.evictionThreshold ?? 0.8; // 默认80%
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
            this.entries.delete(key);
            this.totalEstimatedSize -= record.estimatedSize;
            return undefined;
        }

        // 更新访问记录（用于LRU-K）
        const now = Date.now();
        const updatedAccessTimes = [...record.accessTimes, now].slice(-this.lruK);
        const updatedAccessCount = record.accessCount + 1;

        // 计算优先级（如果有优先级函数）
        let priority: number | undefined;
        if (this.priorityFn) {
            priority = this.priorityFn(key, record.value);
        }

        // 重新设置缓存项以更新访问时间
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

        // 计算估计大小
        let estimatedSize = 1; // 默认大小
        if (this.sizeEstimator) {
            estimatedSize = this.sizeEstimator(key, value);
        }

        // 计算优先级（如果有优先级函数）
        let priority: number | undefined;
        if (this.priorityFn) {
            priority = this.priorityFn(key, value);
        }

        if (this.entries.has(key)) {
            const existing = this.entries.get(key)!;
            this.totalEstimatedSize -= existing.estimatedSize;
            this.entries.delete(key);
        }

        // 添加新的缓存项
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
        this.evictOverflow();
    }

    /**
     * 删除指定键的缓存。
     * @param key 缓存键
     */
    delete(key: K): void {
        const record = this.entries.get(key);
        if (record) {
            this.totalEstimatedSize -= record.estimatedSize;
        }
        this.entries.delete(key);
    }

    /**
     * 清空所有缓存。
     */
    clear(): void {
        this.entries.clear();
        this.totalEstimatedSize = 0;
    }

    /**
     * 获取当前缓存大小。
     * @returns 缓存条目数量
     */
    size(): number {
        return this.entries.size;
    }

    /**
     * 获取当前估算的总内存大小。
     */
    estimatedSize(): number {
        return this.totalEstimatedSize;
    }

    /**
     * 获取缓存容量利用率。
     */
    utilization(): number {
        if (this.maxSize === 0) return 0;
        return this.entries.size / this.maxSize;
    }

    private evictOverflow(): void {
        // 根据驱逐阈值决定是否开始驱逐
        const thresholdSize = Math.floor(this.maxSize * this.evictionThreshold);
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

    private selectKeyForEviction(): K | undefined {
        // 实现多种驱逐策略
        // 1. 首先尝试基于优先级的驱逐（优先级最低的优先被驱逐）
        const entriesArray = Array.from(this.entries.entries());

        // 如果有优先级信息，使用优先级作为主要驱逐依据
        if (entriesArray.some(([_, item]) => item.priority !== undefined)) {
            const lowestPriorityEntry = entriesArray.reduce((lowest, current) => {
                const currentPriority = current[1].priority ?? Number.POSITIVE_INFINITY;
                const lowestPriority = lowest[1].priority ?? Number.POSITIVE_INFINITY;

                // 如果优先级相同，则使用LRU策略
                if (currentPriority === lowestPriority) {
                    const currentLatestAccess = Math.max(...current[1].accessTimes);
                    const lowestLatestAccess = Math.max(...lowest[1].accessTimes);

                    return currentLatestAccess < lowestLatestAccess ? current : lowest;
                }

                return currentPriority < lowestPriority ? current : lowest;
            });

            return lowestPriorityEntry[0];
        }

        // 2. 如果没有优先级，则使用改进的LRU-K算法
        // 选择最近最少访问的项（基于最后一次访问时间和访问频率）
        let oldestKey: K | undefined;
        let oldestTime = Infinity;

        for (const [key, item] of this.entries) {
            // 使用最后一次访问时间作为LRU判断依据
            const latestAccess = Math.max(...item.accessTimes);
            if (latestAccess < oldestTime) {
                oldestTime = latestAccess;
                oldestKey = key;
            }
        }

        return oldestKey;
    }

    private pruneExpired(now: number): void {
        if (this.ttlMs <= 0) {
            return;
        }

        for (const [key, record] of this.entries) {
            if (this.isExpired(record.timestamp, now)) {
                this.totalEstimatedSize -= record.estimatedSize;
                this.entries.delete(key);
            }
        }
    }

    private isExpired(timestamp: number, now: number = Date.now()): boolean {
        if (this.ttlMs <= 0) {
            return false;
        }
        return now - timestamp > this.ttlMs;
    }
}

// 为保持向后兼容性，保留原有的LruCache类
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
        const refreshed = {value: record.value, timestamp: Date.now()};
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
        this.entries.set(key, {value, timestamp: now});
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
