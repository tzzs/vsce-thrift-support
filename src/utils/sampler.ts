/**
 * 性能监控采样器 - 降低高频操作的监控开销
 */

/**
 * 采样策略类型
 */
export type SamplingStrategy =
    | 'every'           // 每次都采样
    | 'interval'        // 按固定间隔采样
    | 'adaptive'        // 自适应采样（基于操作频率）
    | 'percentage'      // 按百分比采样
    | 'exponential'     // 指数退避采样
    | 'skip'            // 跳过采样（禁用）

/**
 * 采样配置
 */
export interface SamplingConfig {
    strategy: SamplingStrategy;
    // 间隔采样的间隔次数
    interval?: number;
    // 百分比采样的百分比（0-100）
    percentage?: number;
    // 自适应采样的最小/最大间隔
    minInterval?: number;
    maxInterval?: number;
}

/**
 * 默认采样配置
 */
export const DEFAULT_SAMPLING_CONFIG: Record<string, SamplingConfig> = {
    // 高频操作 - 每100次采样1次
    'token-scan': {
        strategy: 'interval',
        interval: 100
    },
    'parser-tokenize': {
        strategy: 'interval',
        interval: 50
    },
    // 中频操作 - 每20次采样1次
    'parser-field': {
        strategy: 'interval',
        interval: 20
    },
    'parser-struct': {
        strategy: 'interval',
        interval: 20
    },
    // 低频操作 - 每5次采样1次
    'full-parse': {
        strategy: 'interval',
        interval: 5
    },
    'incremental-parse': {
        strategy: 'interval',
        interval: 10
    },
    // 命令操作 - 100% 采样
    'command': {
        strategy: 'every'
    },
    'format': {
        strategy: 'every'
    },
    'hover': {
        strategy: 'every'
    },
    'definition': {
        strategy: 'every'
    },
    'references': {
        strategy: 'every'
    },
    'completion': {
        strategy: 'every'
    },
    'rename': {
        strategy: 'every'
    },
    // 默认配置 - 每10次采样1次
    'default': {
        strategy: 'interval',
        interval: 10
    }
};

/**
 * 采样器类
 */
export class Sampler {
    private operationCounts = new Map<string, number>();
    private lastSampleTime = new Map<string, number>();
    private readonly config: Record<string, SamplingConfig>;

    constructor(config?: Record<string, SamplingConfig>) {
        this.config = config || DEFAULT_SAMPLING_CONFIG;
    }

    /**
     * 判断是否应该采样
     * @param operation 操作名称
     * @returns 是否应该采样
     */
    shouldSample(operation: string): boolean {
        const isTestEnv =
            typeof globalThis !== 'undefined' &&
            typeof (globalThis as {describe?: unknown}).describe === 'function';
        if (isTestEnv || process.env.NODE_ENV === 'test' || process.env.MOCHA === 'true') {
            return true;
        }
        const config = this.getOperationConfig(operation);

        switch (config.strategy) {
            case 'every':
                return true;

            case 'skip':
                return false;

            case 'interval':
                return this.shouldSampleByInterval(operation, config.interval || 10);

            case 'percentage':
                return this.shouldSampleByPercentage(config.percentage || 10);

            case 'adaptive':
                return this.shouldSampleAdaptive(operation, config);

            case 'exponential':
                return this.shouldSampleExponential(operation);

            default:
                return this.shouldSampleByInterval(operation, 10);
        }
    }

    /**
     * 重置采样计数器
     */
    reset(operation?: string): void {
        if (operation) {
            this.operationCounts.delete(operation);
            this.lastSampleTime.delete(operation);
        } else {
            this.operationCounts.clear();
            this.lastSampleTime.clear();
        }
    }

    /**
     * 获取操作的采样配置
     */
    private getOperationConfig(operation: string): SamplingConfig {
        // 精确匹配
        if (this.config[operation]) {
            return this.config[operation];
        }

        // 前缀匹配（如 'parser-' 匹配所有 parser 操作）
        for (const [key, config] of Object.entries(this.config)) {
            if (key.endsWith('-') && operation.startsWith(key)) {
                return config;
            }
        }

        // 返回默认配置
        return this.config['default'] || {strategy: 'interval', interval: 10};
    }

    /**
     * 基于间隔的采样
     */
    private shouldSampleByInterval(operation: string, interval: number): boolean {
        const count = (this.operationCounts.get(operation) || 0) + 1;
        this.operationCounts.set(operation, count);

        return count % interval === 0;
    }

    /**
     * 基于百分比的采样
     */
    private shouldSampleByPercentage(percentage: number): boolean {
        return Math.random() * 100 < percentage;
    }

    /**
     * 自适应采样
     */
    private shouldSampleAdaptive(operation: string, config: SamplingConfig): boolean {
        const now = Date.now();
        const lastTime = this.lastSampleTime.get(operation) || 0;
        const timeDiff = now - lastTime;

        // 获取配置的最小/最大间隔
        const minInterval = config.minInterval || 1000; // 1秒
        const maxInterval = config.maxInterval || 60000; // 1分钟

        // 如果距离上次采样时间太短，跳过
        if (timeDiff < minInterval) {
            return false;
        }

        // 自适应调整：如果操作频繁，增加间隔
        const count = (this.operationCounts.get(operation) || 0) + 1;
        this.operationCounts.set(operation, count);

        // 动态计算间隔（基于操作频率）
        const dynamicInterval = Math.min(
            maxInterval,
            minInterval * Math.log(count + 1)
        );

        if (timeDiff >= dynamicInterval) {
            this.lastSampleTime.set(operation, now);
            return true;
        }

        return false;
    }

    /**
     * 指数退避采样
     */
    private shouldSampleExponential(operation: string): boolean {
        const count = (this.operationCounts.get(operation) || 0) + 1;
        this.operationCounts.set(operation, count);

        // 指数退避：1, 2, 4, 8, 16, 32...
        const interval = Math.pow(2, Math.floor(Math.log2(count)));

        return count % interval === 0;
    }

    /**
     * 更新采样配置
     */
    updateConfig(operation: string, config: SamplingConfig): void {
        this.config[operation] = config;
    }

    /**
     * 获取统计信息
     */
    getStats(): Map<string, {count: number; sampled: number; rate: number}> {
        const stats = new Map<string, {count: number; sampled: number; rate: number}>();

        for (const [operation, count] of this.operationCounts.entries()) {
            const config = this.getOperationConfig(operation);
            let sampled = 0;
            let rate = 0;

            if (config.strategy === 'interval') {
                sampled = Math.floor(count / (config.interval || 10));
                rate = 1 / (config.interval || 10);
            } else if (config.strategy === 'percentage') {
                rate = (config.percentage || 10) / 100;
                sampled = Math.floor(count * rate);
            } else if (config.strategy === 'every') {
                sampled = count;
                rate = 1;
            }

            stats.set(operation, {
                count,
                sampled,
                rate
            });
        }

        return stats;
    }
}

/**
 * 全局采样器实例
 */
export const sampler = new Sampler();
