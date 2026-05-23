"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = exports.memoryConfig = exports.cacheConfig = exports.DEFAULT_CACHE_ENTRY = void 0;
exports.DEFAULT_CACHE_ENTRY = { maxSize: 100, ttlMs: 10000 };
exports.cacheConfig = {
    astMaxAgeMs: 5 * 60 * 1000,
    includeTypesMaxAgeMs: 3 * 60 * 1000,
    references: { maxSize: 1000, ttlMs: 30000, lruK: 2, evictionThreshold: 0.8 },
    workspaceSymbols: { maxSize: 1000, ttlMs: 60000, lruK: 2, evictionThreshold: 0.8 },
    fileSymbols: { maxSize: 500, ttlMs: 30000, lruK: 2, evictionThreshold: 0.7 },
    documentSymbols: { maxSize: 500, ttlMs: 30000, lruK: 2, evictionThreshold: 0.7 },
    hoverIncludes: { maxSize: 200, ttlMs: 30000, lruK: 2, evictionThreshold: 0.8 },
    hoverContent: { maxSize: 100, ttlMs: 30000, lruK: 2, evictionThreshold: 0.7 },
    definition: { maxSize: 1000, ttlMs: 30000, lruK: 2, evictionThreshold: 0.8 },
    definitionDocument: { maxSize: 500, ttlMs: 30000, lruK: 2, evictionThreshold: 0.8 },
    definitionWorkspace: { maxSize: 200, ttlMs: 30000, lruK: 2, evictionThreshold: 0.8 },
    diagnosticsBlocks: { maxSize: 500, ttlMs: 10 * 60 * 1000, lruK: 2, evictionThreshold: 0.7 },
    diagnosticsMembers: { maxSize: 1000, ttlMs: 10 * 60 * 1000, lruK: 2, evictionThreshold: 0.7 }
};
exports.memoryConfig = {
    memoryPressureThreshold: 0.8,
    memoryPressureCheckInterval: 30000,
    gcThreshold: 0.8,
    dynamicAdjustmentFactor: 1.0,
    itemSizeEstimator: (key, value) => {
        const estimate = (obj) => {
            if (obj === null || obj === undefined) {
                return 8;
            }
            if (typeof obj === 'boolean') {
                return 4;
            }
            if (typeof obj === 'number') {
                return 8;
            }
            if (typeof obj === 'string') {
                return obj.length * 2 + 48;
            }
            if (typeof obj === 'symbol') {
                return 32;
            }
            if (typeof obj === 'bigint') {
                return 16;
            }
            if (Array.isArray(obj)) {
                let size = 64;
                for (const item of obj) {
                    size += estimate(item) + 8;
                }
                return size;
            }
            if (typeof obj === 'object') {
                let size = 64;
                const record = obj;
                for (const [k, v] of Object.entries(record)) {
                    size += k.length * 2 + 32;
                    size += estimate(v);
                }
                return size;
            }
            return 64;
        };
        return estimate(key) + estimate(value) + 16;
    },
    evictionStrategy: 'lru'
};
exports.config = {
    filePatterns: {
        thrift: '**/*.thrift',
        excludeNodeModules: '**/node_modules/**'
    },
    search: {
        workspaceFileLimit: 1000,
        includeFileLimit: 1
    },
    cache: exports.cacheConfig,
    references: {
        fileListUpdateIntervalMs: 30000,
        astCacheTtlMs: 5000
    },
    workspaceSymbols: {
        fileListUpdateIntervalMs: 30000
    },
    diagnostics: {
        analysisDelayMs: 300,
        minAnalysisIntervalMs: 1000,
        maxConcurrentAnalyses: 3,
        dependentAnalysisDelayFactor: 2
    },
    performance: {
        slowOperationThresholdMs: 100,
        maxMetrics: 100
    },
    incremental: {
        analysisEnabled: true,
        formattingEnabled: true,
        maxDirtyLines: 200
    },
    memory: exports.memoryConfig
};
//# sourceMappingURL=index.js.map