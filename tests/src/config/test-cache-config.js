const assert = require('assert');
const {
    CACHE_CONFIGS,
    validateCacheConfig,
    getAllCacheConfigs,
    registerAllCacheConfigs,
    updateCacheConfig
} = require('../../../out/config/cache-config.js');

describe('CacheConfig', () => {
    before(() => {
        require('vscode');
    });

    describe('CACHE_CONFIGS integrity', () => {
        it('should contain all expected cache config keys', () => {
            const expectedKeys = [
                'ast-full', 'ast-region', 'diagnostics-blocks', 'diagnostics-members',
                'documentSymbols', 'workspaceSymbols', 'fileSymbols',
                'definition', 'document', 'workspace',
                'references', 'references-ast',
                'hoverIncludes', 'hoverContent',
                'completion-items', 'formatting'
            ];
            for (const key of expectedKeys) {
                assert.ok(CACHE_CONFIGS[key] !== undefined, `CACHE_CONFIGS["${key}"] should exist`);
            }
        });

        it('each config should have maxSize, ttl, and lruK', () => {
            for (const [name, cfg] of Object.entries(CACHE_CONFIGS)) {
                assert.strictEqual(typeof cfg.maxSize, 'number', `${name}: maxSize`);
                assert.strictEqual(typeof cfg.ttl, 'number', `${name}: ttl`);
                assert.strictEqual(cfg.lruK, 2, `${name}: lruK`);
            }
        });
    });

    describe('validateCacheConfig()', () => {
        it('should return false when maxSize <= 0', () => {
            assert.strictEqual(validateCacheConfig('test', {maxSize: 0, ttl: 1000, lruK: 2, evictionThreshold: 0.8}), false);
            assert.strictEqual(validateCacheConfig('test', {maxSize: -1, ttl: 1000, lruK: 2, evictionThreshold: 0.8}), false);
        });

        it('should return false when ttl < 0', () => {
            assert.strictEqual(validateCacheConfig('test', {maxSize: 10, ttl: -1, lruK: 2, evictionThreshold: 0.8}), false);
        });

        it('should return false when evictionThreshold <= 0', () => {
            assert.strictEqual(validateCacheConfig('test', {maxSize: 10, ttl: 1000, lruK: 2, evictionThreshold: 0}), false);
            assert.strictEqual(validateCacheConfig('test', {maxSize: 10, ttl: 1000, lruK: 2, evictionThreshold: -0.5}), false);
        });

        it('should return false when evictionThreshold > 1', () => {
            assert.strictEqual(validateCacheConfig('test', {maxSize: 10, ttl: 1000, lruK: 2, evictionThreshold: 1.5}), false);
            assert.strictEqual(validateCacheConfig('test', {maxSize: 10, ttl: 1000, lruK: 2, evictionThreshold: 2}), false);
        });

        it('should return false when lruK < 1', () => {
            assert.strictEqual(validateCacheConfig('test', {maxSize: 10, ttl: 1000, lruK: 0, evictionThreshold: 0.8}), false);
            assert.strictEqual(validateCacheConfig('test', {maxSize: 10, ttl: 1000, lruK: -1, evictionThreshold: 0.8}), false);
        });

        it('should return true for valid config', () => {
            assert.strictEqual(validateCacheConfig('test', {maxSize: 10, ttl: 1000, lruK: 2, evictionThreshold: 0.8}), true);
        });

        it('should pass when evictionThreshold is exactly 1', () => {
            assert.strictEqual(validateCacheConfig('test', {maxSize: 10, ttl: 1000, lruK: 2, evictionThreshold: 1}), true);
        });

        it('should pass when ttl is 0', () => {
            assert.strictEqual(validateCacheConfig('test', {maxSize: 10, ttl: 0, lruK: 2, evictionThreshold: 0.8}), true);
        });

        it('should pass when evictionThreshold and lruK are undefined (defaults used)', () => {
            assert.strictEqual(validateCacheConfig('test', {maxSize: 10, ttl: 1000}), true);
        });
    });

    describe('getAllCacheConfigs()', () => {
        it('should return a shallow copy of CACHE_CONFIGS', () => {
            const configs = getAllCacheConfigs();
            assert.strictEqual(typeof configs, 'object');
            assert.ok('ast-full' in configs);
            assert.ok('references' in configs);
        });

        it('should not mutate original when modifying returned object', () => {
            const originalRef = CACHE_CONFIGS['ast-full'];
            const configs = getAllCacheConfigs();
            configs['ast-full'] = {maxSize: 99999, ttl: 1, lruK: 99, evictionThreshold: 0.1};
            assert.strictEqual(CACHE_CONFIGS['ast-full'], originalRef, 'original CACHE_CONFIGS should not be mutated');
        });
    });

    describe('registerAllCacheConfigs()', () => {
        it('should register all valid configs to cacheManager', () => {
            const registered = [];
            const cacheManager = {
                registerCache: (name, cfg) => {
                    registered.push({name, cfg});
                }
            };
            registerAllCacheConfigs(cacheManager);
            assert.ok(registered.length > 0, 'should register at least some configs');
            const names = registered.map(r => r.name);
            assert.ok(names.includes('ast-full'));
            assert.ok(names.includes('references'));
        });

        it('should skip invalid configs and not crash', () => {
            const registered = [];
            const cacheManager = {
                registerCache: (name, cfg) => {
                    registered.push({name, cfg});
                }
            };
            const prevMaxSize = CACHE_CONFIGS['ast-full'].maxSize;
            CACHE_CONFIGS['ast-full'] = {...CACHE_CONFIGS['ast-full'], maxSize: 0};
            try {
                registerAllCacheConfigs(cacheManager);
                const names = registered.map(r => r.name);
                assert.ok(!names.includes('ast-full'), 'invalid config should be skipped');
            } finally {
                CACHE_CONFIGS['ast-full'] = {...CACHE_CONFIGS['ast-full'], maxSize: prevMaxSize};
            }
        });
    });

    describe('updateCacheConfig()', () => {
        it('should return null for non-existent config name', () => {
            const result = updateCacheConfig('non-existent-cache', {maxSize: 50});
            assert.strictEqual(result, null);
        });

        it('should update existing config when validation passes', () => {
            const prevMaxSize = CACHE_CONFIGS['ast-full'].maxSize;
            try {
                const result = updateCacheConfig('ast-full', {maxSize: 200});
                assert.notStrictEqual(result, null);
                assert.strictEqual(result.maxSize, 200);
                assert.strictEqual(CACHE_CONFIGS['ast-full'].maxSize, 200);
            } finally {
                CACHE_CONFIGS['ast-full'] = {...CACHE_CONFIGS['ast-full'], maxSize: prevMaxSize};
            }
        });

        it('should return null when updated config fails validation', () => {
            const result = updateCacheConfig('ast-full', {maxSize: 0});
            assert.strictEqual(result, null);
        });
    });
});
