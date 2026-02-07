/**
 * 缓存条目配置
 */
export interface CacheEntry {
    /** 缓存最大条目数 */
    maxSize: number;
    /** 缓存条目存活时间（毫秒） */
    ttlMs: number;
    /** LRU-K 参数，默认为2，表示考虑最后2次访问 */
    lruK?: number;
    /** 驱逐阈值，当达到这个比例时开始主动驱逐，默认0.8 */
    evictionThreshold?: number;
}

/**
 * 缓存配置，定义各类缓存的过期时间与大小
 */
export interface CacheConfig {
    /** AST 缓存最大存活时间（毫秒） */
    astMaxAgeMs: number;
    /** include 类型缓存最大存活时间（毫秒） */
    includeTypesMaxAgeMs: number;
    /** References 缓存配置 */
    references: CacheEntry;
    /** Workspace symbols 缓存配置 */
    workspaceSymbols: CacheEntry;
    /** File symbols 缓存配置 */
    fileSymbols: CacheEntry;
    /** Document symbols 缓存配置 */
    documentSymbols: CacheEntry;
    /** Hover includes 缓存配置 */
    hoverIncludes: CacheEntry;
    /** Hover 内容缓存配置 */
    hoverContent: CacheEntry;
    /** Definition 缓存配置 */
    definition: CacheEntry;
    /** Definition（文档级）缓存配置 */
    definitionDocument: CacheEntry;
    /** Definition（工作区级）缓存配置 */
    definitionWorkspace: CacheEntry;
    /** Diagnostics block 缓存配置 */
    diagnosticsBlocks: CacheEntry;
    /** Diagnostics member 缓存配置 */
    diagnosticsMembers: CacheEntry;
}

/** 内存管理配置 */
export interface MemoryConfig {
    /** 内存使用峰值阈值（默认0.8，即80%） */
    memoryPressureThreshold: number;
    /** 内存压力检查间隔（毫秒，默认30秒） */
    memoryPressureCheckInterval: number;
    /** GC触发阈值（默认0.8，即80%） */
    gcThreshold: number;
    /** 缓存大小动态调整因子（默认1.0，1.0表示根据内存压力自动调整） */
    dynamicAdjustmentFactor: number;
    /** 估算单个项目内存占用大小的函数 */
    itemSizeEstimator: (key: any, value: any) => number;
    /** 驱逐策略类型 */
    evictionStrategy: 'lru' | 'lfu' | 'ttl' | 'memory-pressure' | 'priority';
}

/** 默认缓存条目配置 */
export const DEFAULT_CACHE_ENTRY: CacheEntry = {maxSize: 100, ttlMs: 10000};

/** 缓存配置默认值 */
export const cacheConfig: CacheConfig = {
    astMaxAgeMs: 5 * 60 * 1000, // 抽象语法树缓存最大年龄
    includeTypesMaxAgeMs: 3 * 60 * 1000, // 包含类型缓存最大年龄
    references: {maxSize: 1000, ttlMs: 30000, lruK: 2, evictionThreshold: 0.8}, // 引用缓存配置 - 从 10s 延长至 30s
    workspaceSymbols: {maxSize: 1000, ttlMs: 60000, lruK: 2, evictionThreshold: 0.8}, // 工作区符号缓存配置
    fileSymbols: {maxSize: 500, ttlMs: 30000, lruK: 2, evictionThreshold: 0.7}, // 文件符号缓存配置
    documentSymbols: {maxSize: 500, ttlMs: 30000, lruK: 2, evictionThreshold: 0.7}, // 文档符号缓存配置 - 从 10s 延长至 30s
    hoverIncludes: {maxSize: 200, ttlMs: 30000, lruK: 2, evictionThreshold: 0.8}, // 悬停包含缓存配置
    hoverContent: {maxSize: 100, ttlMs: 30000, lruK: 2, evictionThreshold: 0.7}, // 悬停内容缓存配置 - 从 10s 延长至 30s
    definition: {maxSize: 1000, ttlMs: 30000, lruK: 2, evictionThreshold: 0.8}, // 定义缓存配置 - 从 10s 延长至 30s
    definitionDocument: {maxSize: 500, ttlMs: 30000, lruK: 2, evictionThreshold: 0.8}, // 定义文档缓存配置 - 从 10s 延长至 30s
    definitionWorkspace: {maxSize: 200, ttlMs: 30000, lruK: 2, evictionThreshold: 0.8}, // 定义工作区缓存配置
    diagnosticsBlocks: {maxSize: 500, ttlMs: 10 * 60 * 1000, lruK: 2, evictionThreshold: 0.7}, // 诊断块级缓存配置 - 从 5min 延长至 10min，maxSize 从 200 提升至 500
    diagnosticsMembers: {maxSize: 1000, ttlMs: 10 * 60 * 1000, lruK: 2, evictionThreshold: 0.7} // 诊断成员级缓存配置 - 从 5min 延长至 10min，maxSize 从 500 提升至 1000
};

/** 内存配置默认值 */
export const memoryConfig: MemoryConfig = {
    memoryPressureThreshold: 0.8,
    memoryPressureCheckInterval: 30000,
    gcThreshold: 0.8,
    dynamicAdjustmentFactor: 1.0,
    itemSizeEstimator: (key: any, value: any) => {
        // 改进的内存估算函数，考虑对象结构深度和类型
        const estimate = (obj: any): number => {
            if (obj === null || obj === undefined) {return 8;}
            if (typeof obj === 'boolean') {return 4;}
            if (typeof obj === 'number') {return 8;}
            if (typeof obj === 'string') {return obj.length * 2 + 48;} // Unicode 字符 + 对象开销
            if (typeof obj === 'symbol') {return 32;}
            if (typeof obj === 'bigint') {return 16;}

            // 对象或数组
            if (Array.isArray(obj)) {
                let size = 64; // Array 对象开销
                for (const item of obj) {
                    size += estimate(item) + 8; // 数组元素引用
                }
                return size;
            }

            if (typeof obj === 'object') {
                let size = 64; // 对象开销
                for (const [k, v] of Object.entries(obj)) {
                    size += k.length * 2 + 32; // 键的开销
                    size += estimate(v); // 值的开销
                }
                return size;
            }

            return 64; // 默认对象大小
        };

        return estimate(key) + estimate(value) + 16; // 键值对总大小
    },
    evictionStrategy: 'lru'
};

/**
 * 全局配置集合
 */
export const config = {
    /** 文件模式配置 */
    filePatterns: {
        /** Thrift 文件匹配模式 */
        thrift: '**/*.thrift',
        /** 排除 node_modules */
        excludeNodeModules: '**/node_modules/**'
    },
    /** 搜索相关配置 */
    search: {
        /** 每次搜索处理的最大文件数 */
        workspaceFileLimit: 1000,
        /** include 文件搜索的最大数量 */
        includeFileLimit: 1
    },
    /** 缓存相关配置 */
    cache: cacheConfig,
    /** References 相关配置 */
    references: {
        /** 文件列表刷新间隔（毫秒） */
        fileListUpdateIntervalMs: 30000,
        /** AST 缓存 TTL（毫秒） */
        astCacheTtlMs: 5000
    },
    /** Workspace symbols 相关配置 */
    workspaceSymbols: {
        /** 文件列表刷新间隔（毫秒） */
        fileListUpdateIntervalMs: 30000
    },
    /** Diagnostics 相关配置 */
    diagnostics: {
        /** 基础分析延迟（毫秒） */
        analysisDelayMs: 300,
        /** 最小分析间隔（毫秒） */
        minAnalysisIntervalMs: 1000,
        /** 并发诊断分析上限 - 从 1 提升至 3 以提升多文件处理能力 */
        maxConcurrentAnalyses: 3,
        /** 依赖文件分析延迟倍数 */
        dependentAnalysisDelayFactor: 2
    },
    /** 性能监控相关配置 */
    performance: {
        /** 慢操作阈值（毫秒） */
        slowOperationThresholdMs: 100,
        /** 最大性能记录条数 */
        maxMetrics: 100
    },
    /** 增量能力配置（默认启用，不暴露给用户配置） */
    incremental: {
        /** 是否启用增量诊断（仅重新分析脏区） */
        analysisEnabled: true,
        /** 是否启用增量格式化（按脏区生成最小化编辑） */
        formattingEnabled: true,
        /** 单次允许的最大脏区行数，超限则退回全量 */
        maxDirtyLines: 200
    },
    /** 内存管理配置 */
    memory: memoryConfig
};
