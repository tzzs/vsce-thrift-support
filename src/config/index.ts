/**
 * 缓存条目配置
 */
export interface CacheEntry {
    /** 缓存最大条目数 */
    maxSize: number;
    /** 缓存条目存活时间（毫秒） */
    ttlMs: number;
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

/** 默认缓存条目配置 */
export const DEFAULT_CACHE_ENTRY: CacheEntry = {maxSize: 100, ttlMs: 10000};

/** 缓存配置默认值 */
export const cacheConfig: CacheConfig = {
    astMaxAgeMs: 5 * 60 * 1000, // 抽象语法树缓存最大年龄
    includeTypesMaxAgeMs: 3 * 60 * 1000, // 包含类型缓存最大年龄
    references: {maxSize: 1000, ttlMs: 10000}, // 引用缓存配置
    workspaceSymbols: {maxSize: 1000, ttlMs: 60000}, // 工作区符号缓存配置
    fileSymbols: {maxSize: 500, ttlMs: 30000}, // 文件符号缓存配置
    documentSymbols: {maxSize: 500, ttlMs: 10000}, // 文档符号缓存配置
    hoverIncludes: {maxSize: 200, ttlMs: 30000}, // 悬停包含缓存配置
    hoverContent: {maxSize: 100, ttlMs: 10000}, // 悬停内容缓存配置
    definition: {maxSize: 1000, ttlMs: 10000}, // 定义缓存配置
    definitionDocument: {maxSize: 500, ttlMs: 10000}, // 定义文档缓存配置
    definitionWorkspace: {maxSize: 200, ttlMs: 30000}, // 定义工作区缓存配置
    diagnosticsBlocks: {maxSize: 200, ttlMs: 5 * 60 * 1000}, // 诊断块级缓存配置
    diagnosticsMembers: {maxSize: 500, ttlMs: 5 * 60 * 1000} // 诊断成员级缓存配置
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
        /** 并发诊断分析上限 */
        maxConcurrentAnalyses: 1,
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
    }
};
