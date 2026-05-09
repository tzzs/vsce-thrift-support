const assert = require('assert');
const {config, DEFAULT_CACHE_ENTRY, cacheConfig, memoryConfig} = require('../../../out/config/index.js');

describe('Config defaults', () => {
    it('DEFAULT_CACHE_ENTRY should have maxSize=100, ttlMs=10000', () => {
        assert.strictEqual(DEFAULT_CACHE_ENTRY.maxSize, 100);
        assert.strictEqual(DEFAULT_CACHE_ENTRY.ttlMs, 10000);
    });

    it('cacheConfig should have valid astMaxAgeMs and includeTypesMaxAgeMs', () => {
        assert.strictEqual(cacheConfig.astMaxAgeMs, 5 * 60 * 1000);
        assert.strictEqual(cacheConfig.includeTypesMaxAgeMs, 3 * 60 * 1000);
    });

    it('cacheConfig should contain all expected cache entry keys', () => {
        const keys = [
            'references', 'workspaceSymbols', 'fileSymbols', 'documentSymbols',
            'hoverIncludes', 'hoverContent', 'definition', 'definitionDocument',
            'definitionWorkspace', 'diagnosticsBlocks', 'diagnosticsMembers'
        ];
        for (const key of keys) {
            assert.ok(cacheConfig[key] !== undefined, `cacheConfig.${key} should exist`);
            assert.strictEqual(typeof cacheConfig[key].maxSize, 'number');
            assert.strictEqual(typeof cacheConfig[key].ttlMs, 'number');
        }
    });

    it('diagnostics config defaults should be correct', () => {
        assert.strictEqual(config.diagnostics.analysisDelayMs, 300);
        assert.strictEqual(config.diagnostics.minAnalysisIntervalMs, 1000);
        assert.strictEqual(config.diagnostics.maxConcurrentAnalyses, 3);
        assert.strictEqual(config.diagnostics.dependentAnalysisDelayFactor, 2);
    });

    it('incremental config defaults should be correct', () => {
        assert.strictEqual(config.incremental.analysisEnabled, true);
        assert.strictEqual(config.incremental.formattingEnabled, true);
        assert.strictEqual(config.incremental.maxDirtyLines, 200);
    });

    it('performance config defaults should be correct', () => {
        assert.strictEqual(config.performance.slowOperationThresholdMs, 100);
        assert.strictEqual(config.performance.maxMetrics, 100);
    });

    it('search config defaults should be correct', () => {
        assert.strictEqual(config.search.workspaceFileLimit, 1000);
        assert.strictEqual(config.search.includeFileLimit, 1);
    });

    it('memory config should have valid thresholds and default eviction strategy', () => {
        assert.strictEqual(memoryConfig.memoryPressureThreshold, 0.8);
        assert.strictEqual(memoryConfig.gcThreshold, 0.8);
        assert.strictEqual(memoryConfig.dynamicAdjustmentFactor, 1.0);
        assert.strictEqual(memoryConfig.evictionStrategy, 'lru');
        assert.strictEqual(typeof memoryConfig.itemSizeEstimator, 'function');
    });

    it('itemSizeEstimator should calculate size for various types', () => {
        const estimator = memoryConfig.itemSizeEstimator;

        assert.strictEqual(typeof estimator, 'function');

        const nullSize = estimator('nullKey', null);
        assert.ok(nullSize > 0, 'null value should have non-zero size');

        const boolSize = estimator('boolKey', true);
        assert.ok(boolSize > 0, 'boolean value should have non-zero size');

        const numSize = estimator('numKey', 42);
        assert.ok(numSize > 0, 'number value should have non-zero size');

        const strSize = estimator('strKey', 'hello');
        assert.ok(strSize > 0, 'string value should have non-zero size');

        const arrSize = estimator('arrKey', [1, 2, 3]);
        assert.ok(arrSize > 0, 'array value should have non-zero size');

        const objSize = estimator('objKey', {a: 1});
        assert.ok(objSize > 0, 'object value should have non-zero size');
    });

    it('config.cache should reference cacheConfig', () => {
        assert.strictEqual(config.cache, cacheConfig);
    });

    it('config.memory should reference memoryConfig', () => {
        assert.strictEqual(config.memory, memoryConfig);
    });

    it('config.references should have valid fileListUpdateIntervalMs', () => {
        assert.strictEqual(config.references.fileListUpdateIntervalMs, 30000);
        assert.strictEqual(config.references.astCacheTtlMs, 5000);
    });

    it('config.workspaceSymbols should have valid fileListUpdateIntervalMs', () => {
        assert.strictEqual(config.workspaceSymbols.fileListUpdateIntervalMs, 30000);
    });

    it('config.filePatterns should have thrift and node_modules patterns', () => {
        assert.strictEqual(config.filePatterns.thrift, '**/*.thrift');
        assert.strictEqual(config.filePatterns.excludeNodeModules, '**/node_modules/**');
    });
});
