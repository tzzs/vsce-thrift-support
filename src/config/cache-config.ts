/**
 * 缓存配置管理 - 统一管理所有缓存的配置
 */

import {config} from '../config';
import {CacheConfig} from '../utils/cache-manager';
import {ErrorHandler} from '../utils/error-handler';

const errorHandler = ErrorHandler.getInstance();

/**
 * 缓存配置定义
 */
export const CACHE_CONFIGS: Record<string, CacheConfig> = {
    // AST 全量缓存
    'ast-full': {
        maxSize: 100, // 最多缓存 100 个完整的 AST
        ttl: config.cache.astMaxAgeMs,
        lruK: 2, // 考虑最近 2 次访问
        evictionThreshold: 0.8, // 使用率达到 80% 时开始驱逐
        priorityFn: (key, value) => {
            // 优先保留大文件的 AST（假设访问频率更高）
            const astSize = (value as {content?: string}).content?.length || 0;
            return astSize;
        }
    },

    // AST 区域缓存
    'ast-region': {
        maxSize: 200, // 区域缓存可以更大
        ttl: config.cache.astMaxAgeMs,
        lruK: 2,
        evictionThreshold: 0.7, // 更激进的驱逐策略
        priorityFn: (key, value) => {
            // 优先保留大区域的 AST
            const regionSize = Array.isArray(value) ? value.length : 0;
            return regionSize;
        }
    },

    // 诊断分析缓存 - 区块诊断
    'diagnostics-blocks': {
        maxSize: 50, // 诊断分析缓存较小
        ttl: config.cache.astMaxAgeMs,
        lruK: 2,
        evictionThreshold: 0.8
    },

    // 诊断分析缓存 - 成员诊断
    'diagnostics-members': {
        maxSize: 80,
        ttl: config.cache.astMaxAgeMs,
        lruK: 2,
        evictionThreshold: 0.8
    },

    // 符号查找缓存 - 文档符号
    'documentSymbols': {
        maxSize: 150,
        ttl: config.cache.astMaxAgeMs,
        lruK: 2,
        evictionThreshold: 0.8
    },

    // 符号查找缓存 - 工作区符号
    'workspaceSymbols': {
        maxSize: 200,
        ttl: config.cache.astMaxAgeMs,
        lruK: 2,
        evictionThreshold: 0.8
    },

    // 符号查找缓存 - 文件符号
    'fileSymbols': {
        maxSize: 150,
        ttl: config.cache.astMaxAgeMs,
        lruK: 2,
        evictionThreshold: 0.8
    },

    // 定义查找缓存
    'definition': {
        maxSize: 100,
        ttl: config.cache.astMaxAgeMs,
        lruK: 2,
        evictionThreshold: 0.8
    },

    // 定义文档缓存
    'document': {
        maxSize: 150,
        ttl: config.cache.astMaxAgeMs,
        lruK: 2,
        evictionThreshold: 0.8
    },

    // 工作区定义缓存
    'workspace': {
        maxSize: 200,
        ttl: config.cache.astMaxAgeMs,
        lruK: 2,
        evictionThreshold: 0.8
    },

    // 引用查找缓存
    'references': {
        maxSize: 100,
        ttl: config.cache.astMaxAgeMs,
        lruK: 2,
        evictionThreshold: 0.8
    },

    // 引用 AST 缓存
    'references-ast': {
        maxSize: config.cache.references?.maxSize || 100,
        ttl: config.cache.references?.ttlMs || config.cache.astMaxAgeMs,
        lruK: config.cache.references?.lruK || 2,
        evictionThreshold: config.cache.references?.evictionThreshold || 0.8,
        priorityFn: () => {
            // 基于命中率优先
            return 1;
        },
        sizeEstimator: (key: string, value: unknown) => {
            // 估算内存使用
            try {
                let contentHashLength = 0;
                if (typeof value === 'object' && value) {
                    const record = value as {contentHash?: unknown};
                    if (typeof record.contentHash === 'string') {
                        contentHashLength = record.contentHash.length;
                    }
                }
                return key.length + contentHashLength;
            } catch {
                return 100;
            }
        }
    },

    // 悬停包含缓存
    'hoverIncludes': {
        maxSize: 50,
        ttl: config.cache.astMaxAgeMs,
        lruK: 2,
        evictionThreshold: 0.8
    },

    // 悬停内容缓存
    'hoverContent': {
        maxSize: 100,
        ttl: config.cache.astMaxAgeMs,
        lruK: 2,
        evictionThreshold: 0.8
    },

    // 完成项缓存
    'completion-items': {
        maxSize: 150,
        ttl: config.cache.astMaxAgeMs,
        lruK: 2,
        evictionThreshold: 0.7
    },

    // 格式化缓存
    'formatting': {
        maxSize: 80,
        ttl: config.cache.astMaxAgeMs,
        lruK: 2,
        evictionThreshold: 0.8
    }
};

/**
 * 缓存配置验证
 */
export function validateCacheConfig(name: string, config: CacheConfig): boolean {
    if (config.maxSize <= 0) {
        errorHandler.handleWarning(`Cache config "${name}": maxSize must be > 0`, {
            component: 'CacheConfig',
            operation: 'validateCacheConfig',
            additionalInfo: {name}
        });
        return false;
    }

    if (config.ttl < 0) {
        errorHandler.handleWarning(`Cache config "${name}": ttl must be >= 0`, {
            component: 'CacheConfig',
            operation: 'validateCacheConfig',
            additionalInfo: {name}
        });
        return false;
    }

    const evictionThreshold = config.evictionThreshold ?? 1;
    if (evictionThreshold <= 0 || evictionThreshold > 1) {
        errorHandler.handleWarning(`Cache config "${name}": evictionThreshold must be in (0, 1]`, {
            component: 'CacheConfig',
            operation: 'validateCacheConfig',
            additionalInfo: {name, evictionThreshold}
        });
        return false;
    }

    if (config.lruK && config.lruK < 1) {
        errorHandler.handleWarning(`Cache config "${name}": lruK must be >= 1`, {
            component: 'CacheConfig',
            operation: 'validateCacheConfig',
            additionalInfo: {name, lruK: config.lruK}
        });
        return false;
    }

    return true;
}

/**
 * 获取所有缓存配置
 */
export function getAllCacheConfigs(): Record<string, CacheConfig> {
    return {...CACHE_CONFIGS};
}

/**
 * 注册所有缓存配置到缓存管理器
 */
export function registerAllCacheConfigs(cacheManager: {
    registerCache: (name: string, config: CacheConfig) => void;
}): void {
    for (const [name, config] of Object.entries(CACHE_CONFIGS)) {
        if (validateCacheConfig(name, config)) {
            cacheManager.registerCache(name, config);
        } else {
            errorHandler.handleWarning(`Skipping invalid cache config: ${name}`, {
                component: 'CacheConfig',
                operation: 'registerAllCacheConfigs',
                additionalInfo: {name}
            });
        }
    }
}

/**
 * 更新缓存配置
 */
export function updateCacheConfig(
    name: string,
    updates: Partial<CacheConfig>
): CacheConfig | null {
    const existing = CACHE_CONFIGS[name];
    if (!existing) {
        return null;
    }

    const updated = {...existing, ...updates};
    if (validateCacheConfig(name, updated)) {
        CACHE_CONFIGS[name] = updated;
        return updated;
    }

    return null;
}
