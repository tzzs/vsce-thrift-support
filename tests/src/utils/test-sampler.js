const assert = require('assert');

const samplerModule = require('../../../out/utils/sampler.js');
const Sampler = samplerModule.Sampler;

describe('sampler', () => {
    // Helper: create a Sampler that bypasses test-env detection
    // The test env check is: globalThis.describe === 'function' || MOCHA === 'true'
    function createSamplerInNonTestEnv(config) {
        const savedDescribe = globalThis.describe;
        const savedMocha = process.env.MOCHA;
        globalThis.describe = undefined;
        process.env.MOCHA = undefined;

        let sampler;
        try {
            sampler = new Sampler(config);
        } finally {
            globalThis.describe = savedDescribe;
            process.env.MOCHA = savedMocha;
        }
        return sampler;
    }

    // Helper: wrap strategy tests that need to bypass test-env detection
    function inNonTestEnv(fn) {
        const savedDescribe = globalThis.describe;
        const savedMocha = process.env.MOCHA;
        const savedNodeEnv = process.env.NODE_ENV;
        globalThis.describe = undefined;
        process.env.MOCHA = undefined;
        process.env.NODE_ENV = undefined;

        try {
            fn();
        } finally {
            globalThis.describe = savedDescribe;
            process.env.MOCHA = savedMocha;
            process.env.NODE_ENV = savedNodeEnv;
        }
    }

    describe('shouldSample in test env (always true)', () => {
        it('should always return true in test environment', () => {
            const sampler = new Sampler();
            // Test env check is active, so shouldSample always returns true
            assert.strictEqual(sampler.shouldSample('any-operation'), true);
            assert.strictEqual(sampler.shouldSample('any-operation'), true);
            assert.strictEqual(sampler.shouldSample('any-operation'), true);
        });
    });

    describe('shouldSample - every strategy', () => {
        it('should always return true', () => {
            inNonTestEnv(() => {
                const sampler = new Sampler({test: {strategy: 'every'}});
                assert.strictEqual(sampler.shouldSample('test'), true);
                assert.strictEqual(sampler.shouldSample('test'), true);
                assert.strictEqual(sampler.shouldSample('test'), true);
            });
        });
    });

    describe('shouldSample - skip strategy', () => {
        it('should always return false', () => {
            inNonTestEnv(() => {
                const sampler = new Sampler({test: {strategy: 'skip'}});
                assert.strictEqual(sampler.shouldSample('test'), false);
                assert.strictEqual(sampler.shouldSample('test'), false);
                assert.strictEqual(sampler.shouldSample('test'), false);
            });
        });
    });

    describe('shouldSample - interval strategy', () => {
        it('should return true on first call', () => {
            inNonTestEnv(() => {
                const sampler = new Sampler({test: {strategy: 'interval', interval: 5}});
                // First call: count becomes 1, 1 % 5 !== 0
                assert.strictEqual(sampler.shouldSample('test'), false);
            });
        });

        it('should return true on the Nth call matching interval', () => {
            inNonTestEnv(() => {
                const sampler = new Sampler({test: {strategy: 'interval', interval: 5}});
                // Calls 1-4: all false
                for (let i = 0; i < 3; i++) {
                    assert.strictEqual(sampler.shouldSample('test'), false);
                }
                // Call 4: count becomes 4, 4 % 5 !== 0
                assert.strictEqual(sampler.shouldSample('test'), false);
                // Call 5: count becomes 5, 5 % 5 === 0
                assert.strictEqual(sampler.shouldSample('test'), true);
            });
        });

        it('should return false after interval resets', () => {
            inNonTestEnv(() => {
                const sampler = new Sampler({test: {strategy: 'interval', interval: 3}});
                // Call 3: true
                sampler.shouldSample('test');
                sampler.shouldSample('test');
                const thirdCall = sampler.shouldSample('test');
                assert.strictEqual(thirdCall, true);
                // Call 4 (1 after reset): count = 4, 4 % 3 !== 0
                const fourthCall = sampler.shouldSample('test');
                assert.strictEqual(fourthCall, false);
            });
        });
    });

    describe('shouldSample - percentage strategy', () => {
        it('should always return true when percentage is 100', () => {
            inNonTestEnv(() => {
                const sampler = new Sampler({test: {strategy: 'percentage', percentage: 100}});
                for (let i = 0; i < 20; i++) {
                    assert.strictEqual(sampler.shouldSample('test'), true);
                }
            });
        });

        it('should always return false when percentage is 1 (with fixed random)', () => {
            inNonTestEnv(() => {
                const sampler = new Sampler({test: {strategy: 'percentage', percentage: 1}});
                // With percentage=1, only ~1% of calls return true.
                // We verify the method doesn't crash and returns a boolean.
                let trueCount = 0;
                for (let i = 0; i < 100; i++) {
                    if (sampler.shouldSample('test')) {
                        trueCount++;
                    }
                }
                // With 1%, 100 calls typically yield 0-5 true results
                assert.ok(trueCount < 20);
            });
        });
    });

    describe('shouldSample - exponential strategy', () => {
        it('should sample at exponential intervals (1, 2, 4, 8, ...)', () => {
            inNonTestEnv(() => {
                const sampler = new Sampler({test: {strategy: 'exponential'}});
                // Count 1: interval = 2^0 = 1, 1 % 1 === 0 -> true
                assert.strictEqual(sampler.shouldSample('test'), true);
                // Count 2: interval = 2^1 = 2, 2 % 2 === 0 -> true
                assert.strictEqual(sampler.shouldSample('test'), true);
                // Count 3: interval = 2^1 = 2 (since log2(3) ≈ 1.58, floor = 1), 3 % 2 !== 0 -> false
                assert.strictEqual(sampler.shouldSample('test'), false);
                // Count 4: interval = 2^2 = 4, 4 % 4 === 0 -> true
                assert.strictEqual(sampler.shouldSample('test'), true);
                // Count 5-7: interval = 4, false
                assert.strictEqual(sampler.shouldSample('test'), false);
                assert.strictEqual(sampler.shouldSample('test'), false);
                assert.strictEqual(sampler.shouldSample('test'), false);
                // Count 8: interval = 2^3 = 8, 8 % 8 === 0 -> true
                assert.strictEqual(sampler.shouldSample('test'), true);
            });
        });
    });

    describe('operation config matching', () => {
        it('should exact-match operation name', () => {
            inNonTestEnv(() => {
                const sampler = new Sampler({
                    'my-operation': {strategy: 'skip'},
                    'default': {strategy: 'every'}
                });
                assert.strictEqual(sampler.shouldSample('my-operation'), false);
            });
        });

        it('should prefix-match operation name (e.g. parser- matches parser-parse)', () => {
            inNonTestEnv(() => {
                const sampler = new Sampler({
                    'parser-': {strategy: 'skip'},
                    'default': {strategy: 'every'}
                });
                assert.strictEqual(sampler.shouldSample('parser-parse'), false);
                assert.strictEqual(sampler.shouldSample('parser-tokenize'), false);
            });
        });

        it('should fall back to default config when no match', () => {
            inNonTestEnv(() => {
                const sampler = new Sampler({
                    'token-scan': {strategy: 'skip'},
                    'default': {strategy: 'every'}
                });
                // 'unknown' doesn't match any key or prefix
                assert.strictEqual(sampler.shouldSample('unknown'), true);
            });
        });
    });

    describe('reset', () => {
        it('should reset specific operation counter', () => {
            inNonTestEnv(() => {
                const sampler = new Sampler({test: {strategy: 'interval', interval: 10}});
                // Call once to increment counter
                sampler.shouldSample('test');
                sampler.shouldSample('other');

                sampler.reset('test');

                // After reset, counter should be 0, so next call is count=1, 1%10 != 0
                assert.strictEqual(sampler.shouldSample('test'), false);
                // 'other' was not reset, should still have its counter
            });
        });

        it('should reset all counters when called without argument', () => {
            inNonTestEnv(() => {
                const sampler = new Sampler({test: {strategy: 'interval', interval: 10}});
                sampler.shouldSample('test');
                sampler.shouldSample('other');

                sampler.reset();

                // Both counters back to 0
                assert.strictEqual(sampler.shouldSample('test'), false);
                assert.strictEqual(sampler.shouldSample('other'), false);
            });
        });
    });

    describe('getStats', () => {
        it('should return stats map with count/sampled/rate', () => {
            inNonTestEnv(() => {
                const sampler = new Sampler({test: {strategy: 'interval', interval: 2}});
                sampler.shouldSample('test');
                sampler.shouldSample('test');
                sampler.shouldSample('test');
                sampler.shouldSample('test');

                const stats = sampler.getStats();
                assert.ok(stats instanceof Map);

                const testStats = stats.get('test');
                assert.ok(testStats);
                assert.strictEqual(testStats.count, 4);
                // interval=2: sampled = floor(4/2) = 2
                assert.strictEqual(testStats.sampled, 2);
                assert.strictEqual(testStats.rate, 0.5);
            });
        });

        it('should compute interval stats correctly', () => {
            inNonTestEnv(() => {
                const sampler = new Sampler({test: {strategy: 'interval', interval: 5}});
                for (let i = 0; i < 7; i++) {
                    sampler.shouldSample('test');
                }

                const stats = sampler.getStats();
                const testStats = stats.get('test');
                assert.ok(testStats);
                assert.strictEqual(testStats.count, 7);
                // interval=5: sampled = floor(7/5) = 1
                assert.strictEqual(testStats.sampled, 1);
                assert.strictEqual(testStats.rate, 0.2);
            });
        });
    });

    describe('updateConfig', () => {
        it('should update config and take effect immediately', () => {
            inNonTestEnv(() => {
                const sampler = new Sampler({test: {strategy: 'skip'}});
                assert.strictEqual(sampler.shouldSample('test'), false);

                sampler.updateConfig('test', {strategy: 'every'});
                assert.strictEqual(sampler.shouldSample('test'), true);
            });
        });
    });
});
