"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateCacheConfig = exports.registerAllCacheConfigs = exports.getAllCacheConfigs = exports.validateCacheConfig = exports.CACHE_CONFIGS = void 0;
const config_1 = require("../config");
const error_handler_1 = require("../utils/error-handler");
const errorHandler = error_handler_1.ErrorHandler.getInstance();
exports.CACHE_CONFIGS = {
    'ast-full': {
        maxSize: 100,
        ttl: config_1.config.cache.astMaxAgeMs,
        lruK: 2,
        evictionThreshold: 0.8,
        priorityFn: (key, value) => {
            const astSize = value.content?.length ?? 0;
            return astSize;
        }
    },
    'ast-region': {
        maxSize: 200,
        ttl: config_1.config.cache.astMaxAgeMs,
        lruK: 2,
        evictionThreshold: 0.7,
        priorityFn: (key, value) => {
            const regionSize = Array.isArray(value) ? value.length : 0;
            return regionSize;
        }
    },
    'diagnostics-blocks': {
        maxSize: 50,
        ttl: config_1.config.cache.astMaxAgeMs,
        lruK: 2,
        evictionThreshold: 0.8
    },
    'diagnostics-members': {
        maxSize: 80,
        ttl: config_1.config.cache.astMaxAgeMs,
        lruK: 2,
        evictionThreshold: 0.8
    },
    'documentSymbols': {
        maxSize: 150,
        ttl: config_1.config.cache.astMaxAgeMs,
        lruK: 2,
        evictionThreshold: 0.8
    },
    'workspaceSymbols': {
        maxSize: 200,
        ttl: config_1.config.cache.astMaxAgeMs,
        lruK: 2,
        evictionThreshold: 0.8
    },
    'fileSymbols': {
        maxSize: 150,
        ttl: config_1.config.cache.astMaxAgeMs,
        lruK: 2,
        evictionThreshold: 0.8
    },
    'definition': {
        maxSize: 100,
        ttl: config_1.config.cache.astMaxAgeMs,
        lruK: 2,
        evictionThreshold: 0.8
    },
    'document': {
        maxSize: 150,
        ttl: config_1.config.cache.astMaxAgeMs,
        lruK: 2,
        evictionThreshold: 0.8
    },
    'workspace': {
        maxSize: 200,
        ttl: config_1.config.cache.astMaxAgeMs,
        lruK: 2,
        evictionThreshold: 0.8
    },
    'references': {
        maxSize: 100,
        ttl: config_1.config.cache.astMaxAgeMs,
        lruK: 2,
        evictionThreshold: 0.8
    },
    'references-ast': {
        maxSize: config_1.config.cache.references?.maxSize ?? 100,
        ttl: config_1.config.cache.references?.ttlMs ?? config_1.config.cache.astMaxAgeMs,
        lruK: config_1.config.cache.references?.lruK ?? 2,
        evictionThreshold: config_1.config.cache.references?.evictionThreshold ?? 0.8,
        priorityFn: () => {
            return 1;
        },
        sizeEstimator: (key, value) => {
            try {
                let contentHashLength = 0;
                if (typeof value === 'object' && value) {
                    const record = value;
                    if (typeof record.contentHash === 'string') {
                        contentHashLength = record.contentHash.length;
                    }
                }
                return key.length + contentHashLength;
            }
            catch {
                return 100;
            }
        }
    },
    'hoverIncludes': {
        maxSize: 50,
        ttl: config_1.config.cache.astMaxAgeMs,
        lruK: 2,
        evictionThreshold: 0.8
    },
    'hoverContent': {
        maxSize: 100,
        ttl: config_1.config.cache.astMaxAgeMs,
        lruK: 2,
        evictionThreshold: 0.8
    },
    'completion-items': {
        maxSize: 150,
        ttl: config_1.config.cache.astMaxAgeMs,
        lruK: 2,
        evictionThreshold: 0.7
    },
    'formatting': {
        maxSize: 80,
        ttl: config_1.config.cache.astMaxAgeMs,
        lruK: 2,
        evictionThreshold: 0.8
    }
};
function validateCacheConfig(name, config) {
    if (config.maxSize <= 0) {
        errorHandler.handleWarning(`Cache config "${name}": maxSize must be > 0`, {
            component: 'CacheConfig',
            operation: 'validateCacheConfig',
            additionalInfo: { name }
        });
        return false;
    }
    if (config.ttl < 0) {
        errorHandler.handleWarning(`Cache config "${name}": ttl must be >= 0`, {
            component: 'CacheConfig',
            operation: 'validateCacheConfig',
            additionalInfo: { name }
        });
        return false;
    }
    const evictionThreshold = config.evictionThreshold ?? 1;
    if (evictionThreshold <= 0 || evictionThreshold > 1) {
        errorHandler.handleWarning(`Cache config "${name}": evictionThreshold must be in (0, 1]`, {
            component: 'CacheConfig',
            operation: 'validateCacheConfig',
            additionalInfo: { name, evictionThreshold }
        });
        return false;
    }
    if (config.lruK !== undefined && config.lruK < 1) {
        errorHandler.handleWarning(`Cache config "${name}": lruK must be >= 1`, {
            component: 'CacheConfig',
            operation: 'validateCacheConfig',
            additionalInfo: { name, lruK: config.lruK }
        });
        return false;
    }
    return true;
}
exports.validateCacheConfig = validateCacheConfig;
function getAllCacheConfigs() {
    return { ...exports.CACHE_CONFIGS };
}
exports.getAllCacheConfigs = getAllCacheConfigs;
function registerAllCacheConfigs(cacheManager) {
    for (const [name, config] of Object.entries(exports.CACHE_CONFIGS)) {
        if (validateCacheConfig(name, config)) {
            cacheManager.registerCache(name, config);
        }
        else {
            errorHandler.handleWarning(`Skipping invalid cache config: ${name}`, {
                component: 'CacheConfig',
                operation: 'registerAllCacheConfigs',
                additionalInfo: { name }
            });
        }
    }
}
exports.registerAllCacheConfigs = registerAllCacheConfigs;
function updateCacheConfig(name, updates) {
    const existing = exports.CACHE_CONFIGS[name];
    if (existing === undefined) {
        return null;
    }
    const updated = { ...existing, ...updates };
    if (validateCacheConfig(name, updated)) {
        exports.CACHE_CONFIGS[name] = updated;
        return updated;
    }
    return null;
}
exports.updateCacheConfig = updateCacheConfig;
//# sourceMappingURL=cache-config.js.map