const assert = require('assert');
const {ConfigService} = require('../../../out/config/service.js');

describe('ConfigService', () => {
    let vscode;
    let origGetConfiguration;

    before(() => {
        vscode = require('vscode');
        if (!vscode.ConfigurationTarget) {
            vscode.ConfigurationTarget = {Global: 1};
        }
        if (!vscode.workspace.onDidChangeConfiguration) {
            vscode.workspace.onDidChangeConfiguration = () => ({dispose: () => {}});
        }
        origGetConfiguration = vscode.workspace.getConfiguration;
    });

    afterEach(() => {
        vscode.workspace.getConfiguration = origGetConfiguration;
    });

    function mockGetConfiguration(factory) {
        vscode.workspace.getConfiguration = factory;
    }

    describe('get()', () => {
        it('should return value from workspace config when present', () => {
            mockGetConfiguration(() => ({
                get: (key) => key === 'format.indentSize' ? 3 : undefined
            }));
            const svc = new ConfigService();
            assert.strictEqual(svc.get('format.indentSize'), 3);
        });

        it('should fall back to defaults when workspace config is undefined', () => {
            const svc = new ConfigService();
            assert.strictEqual(svc.get('diagnostics.analysisDelayMs'), 300);
            assert.strictEqual(svc.get('diagnostics.maxConcurrentAnalyses'), 3);
        });

        it('should use provided fallback over defaults when both workspace and defaults undefined', () => {
            const svc = new ConfigService();
            assert.strictEqual(svc.get('nonexistent.key', 'myFallback'), 'myFallback');
        });

        it('should resolve nested dot-separated keys from defaults', () => {
            const svc = new ConfigService();
            assert.strictEqual(svc.get('incremental.analysisEnabled'), true);
            assert.strictEqual(svc.get('incremental.maxDirtyLines'), 200);
            assert.strictEqual(svc.get('performance.slowOperationThresholdMs'), 100);
        });

        it('should return undefined when path does not exist in defaults and no fallback', () => {
            const svc = new ConfigService();
            assert.strictEqual(svc.get('nonexistent.deeply.nested.key'), undefined);
        });
    });

    describe('getCacheConfig()', () => {
        it('should return default cache config', () => {
            const svc = new ConfigService();
            const cfg = svc.getCacheConfig();
            assert.strictEqual(typeof cfg, 'object');
            assert.strictEqual(typeof cfg.astMaxAgeMs, 'number');
        });
    });

    describe('getAllCacheConfigs()', () => {
        it('should return all cache configs via delegate', () => {
            const svc = new ConfigService();
            const configs = svc.getAllCacheConfigs();
            assert.strictEqual(typeof configs, 'object');
            assert.ok('ast-full' in configs);
        });
    });

    describe('updateCacheConfig()', () => {
        it('should update existing cache config and return updated value', () => {
            const svc = new ConfigService();
            const result = svc.updateCacheConfig('ast-full', {maxSize: 99});
            assert.notStrictEqual(result, null);
            assert.strictEqual(result.maxSize, 99);
            svc.updateCacheConfig('ast-full', {maxSize: 100});
        });

        it('should return null for non-existent cache config name', () => {
            const svc = new ConfigService();
            const result = svc.updateCacheConfig('does-not-exist', {maxSize: 50});
            assert.strictEqual(result, null);
        });
    });

    describe('getMemoryConfig()', () => {
        it('should return default memory config with itemSizeEstimator', () => {
            const svc = new ConfigService();
            const cfg = svc.getMemoryConfig();
            assert.strictEqual(typeof cfg, 'object');
            assert.strictEqual(cfg.memoryPressureThreshold, 0.8);
            assert.strictEqual(typeof cfg.itemSizeEstimator, 'function');
        });
    });

    describe('validate()', () => {
        let svc;

        before(() => {
            svc = new ConfigService();
        });

        describe('indentSize', () => {
            it('should reject non-number', () => {
                const result = svc.validate('format.indentSize', '2');
                assert.strictEqual(result.valid, false);
            });

            it('should reject value < 1', () => {
                const result = svc.validate('format.indentSize', 0);
                assert.strictEqual(result.valid, false);
            });

            it('should reject value > 8', () => {
                const result = svc.validate('format.indentSize', 9);
                assert.strictEqual(result.valid, false);
            });

            it('should accept valid values', () => {
                assert.strictEqual(svc.validate('format.indentSize', 1).valid, true);
                assert.strictEqual(svc.validate('format.indentSize', 4).valid, true);
                assert.strictEqual(svc.validate('format.indentSize', 8).valid, true);
            });
        });

        describe('maxLineLength', () => {
            it('should reject non-number', () => {
                const result = svc.validate('format.maxLineLength', '80');
                assert.strictEqual(result.valid, false);
            });

            it('should reject value < 40', () => {
                const result = svc.validate('format.maxLineLength', 39);
                assert.strictEqual(result.valid, false);
            });

            it('should reject value > 200', () => {
                const result = svc.validate('format.maxLineLength', 201);
                assert.strictEqual(result.valid, false);
            });

            it('should accept valid values', () => {
                assert.strictEqual(svc.validate('format.maxLineLength', 80).valid, true);
                assert.strictEqual(svc.validate('format.maxLineLength', 120).valid, true);
            });
        });

        describe('trailingComma', () => {
            it('should reject non-string', () => {
                const result = svc.validate('format.trailingComma', true);
                assert.strictEqual(result.valid, false);
            });

            it('should reject invalid string values', () => {
                assert.strictEqual(svc.validate('format.trailingComma', 'none').valid, false);
                assert.strictEqual(svc.validate('format.trailingComma', 'always').valid, false);
            });

            it('should accept preserve, add, remove', () => {
                assert.strictEqual(svc.validate('format.trailingComma', 'preserve').valid, true);
                assert.strictEqual(svc.validate('format.trailingComma', 'add').valid, true);
                assert.strictEqual(svc.validate('format.trailingComma', 'remove').valid, true);
            });
        });

        describe('boolean keys', () => {
            it('should reject non-boolean values', () => {
                assert.strictEqual(svc.validate('format.alignTypes', 'true').valid, false);
                assert.strictEqual(svc.validate('format.alignTypes', 1).valid, false);
            });

            it('should accept boolean values', () => {
                assert.strictEqual(svc.validate('format.alignTypes', true).valid, true);
                assert.strictEqual(svc.validate('format.alignComments', false).valid, true);
                assert.strictEqual(svc.validate('diagnostics.debug', true).valid, true);
            });
        });

        describe('collectionStyle', () => {
            it('should reject non-string', () => {
                const result = svc.validate('format.collectionStyle', 123);
                assert.strictEqual(result.valid, false);
            });

            it('should reject invalid string values', () => {
                assert.strictEqual(svc.validate('format.collectionStyle', 'inline').valid, false);
            });

            it('should accept preserve, multiline, auto', () => {
                assert.strictEqual(svc.validate('format.collectionStyle', 'preserve').valid, true);
                assert.strictEqual(svc.validate('format.collectionStyle', 'multiline').valid, true);
                assert.strictEqual(svc.validate('format.collectionStyle', 'auto').valid, true);
            });
        });

        describe('shared schema validation', () => {
            it('should validate lint severity from the core schema', () => {
                assert.strictEqual(svc.validate('lint.severity', 'warning').valid, true);
                assert.strictEqual(svc.validate('lint.severity', 'debug').valid, false);
            });

            it('should validate diagnostics rules from the core schema', () => {
                assert.strictEqual(svc.validate('diagnostics.rules', {}).valid, true);
                assert.strictEqual(svc.validate('diagnostics.rules', false).valid, false);
            });
        });

        it('should return valid for unknown keys (loose validation)', () => {
            const result = svc.validate('some.unknown.key', 'anything');
            assert.strictEqual(result.valid, true);
        });
    });

    describe('onDidChange()', () => {
        it('should register listener and return disposable', () => {
            const svc = new ConfigService();
            const disposable = svc.onDidChange(() => {});
            assert.strictEqual(typeof disposable, 'object');
            assert.strictEqual(typeof disposable.dispose, 'function');
        });

        it('should call listener when thrift config changes', () => {
            let configCallback;
            const origOnChange = vscode.workspace.onDidChangeConfiguration;
            vscode.workspace.onDidChangeConfiguration = (cb) => {
                configCallback = cb;
                return {dispose: () => { configCallback = null; }};
            };
            try {
                const svc = new ConfigService();
                let called = false;
                svc.onDidChange(() => { called = true; });
                const event = {
                    affectsConfiguration: (section) => section === 'thrift' || section.startsWith('thrift.')
                };
                configCallback(event);
                assert.strictEqual(called, true);
            } finally {
                vscode.workspace.onDidChangeConfiguration = origOnChange;
            }
        });

        it('should not call listener for unrelated config changes', () => {
            let configCallback;
            const origOnChange = vscode.workspace.onDidChangeConfiguration;
            vscode.workspace.onDidChangeConfiguration = (cb) => {
                configCallback = cb;
                return {dispose: () => { configCallback = null; }};
            };
            try {
                const svc = new ConfigService();
                let called = false;
                svc.onDidChange(() => { called = true; });
                const event = {
                    affectsConfiguration: (section) => section !== 'thrift'
                };
                configCallback(event);
                assert.strictEqual(called, false);
            } finally {
                vscode.workspace.onDidChangeConfiguration = origOnChange;
            }
        });
    });

    describe('reset()', () => {
        it('should reset specific key to undefined', async () => {
            mockGetConfiguration(() => ({
                get: () => undefined,
                update: (key, value) => {
                    updatedKey = key;
                    updatedValue = value;
                    return Promise.resolve();
                }
            }));
            let updatedKey;
            let updatedValue;
            const svc = new ConfigService();
            await svc.reset('format.indentSize');
            assert.strictEqual(updatedKey, 'format.indentSize');
            assert.strictEqual(updatedValue, undefined);
        });

        it('should reset all top-level keys when no key specified', async () => {
            mockGetConfiguration(() => ({
                get: () => undefined,
                update: (key, value) => {
                    updatedKeys.push(key);
                    return Promise.resolve();
                }
            }));
            const updatedKeys = [];
            const svc = new ConfigService();
            await svc.reset();
            assert.ok(updatedKeys.length > 0, 'should update multiple keys');
        });
    });

    describe('getAffectedKeys integration', () => {
        it('should find affected keys from nested config structure via onDidChange', () => {
            let configCallback;
            const origOnChange = vscode.workspace.onDidChangeConfiguration;
            vscode.workspace.onDidChangeConfiguration = (cb) => {
                configCallback = cb;
                return {dispose: () => { configCallback = null; }};
            };
            try {
                const svc = new ConfigService();
                let receivedChanges = [];
                svc.onDidChange((changes) => { receivedChanges = changes; });
                const event = {
                    affectsConfiguration: (section) => section.startsWith('thrift')
                };
                configCallback(event);
                assert.ok(receivedChanges.length > 0, 'should receive changes');
            } finally {
                vscode.workspace.onDidChangeConfiguration = origOnChange;
            }
        });
    });
});
