const assert = require('assert');

const {
    DEFAULT_FORMAT_CONFIG,
    SHARED_CONFIG_SCHEMA,
    findUnknownConfigKeys,
    validateSharedConfigValue
} = require('../../../out/config/schema.js');

describe('Shared config schema', () => {
    it('defines shared format, lint, and diagnostics keys', () => {
        assert.strictEqual(DEFAULT_FORMAT_CONFIG.trailingComma, 'preserve');
        assert.strictEqual(DEFAULT_FORMAT_CONFIG.alignStructDefaults, false);
        assert.ok(SHARED_CONFIG_SCHEMA.format.alignAssignments);
        assert.ok(SHARED_CONFIG_SCHEMA.format.alignFieldNames);
        assert.ok(SHARED_CONFIG_SCHEMA.lint.severity);
        assert.ok(SHARED_CONFIG_SCHEMA.diagnostics.rules);
    });

    it('finds unknown keys without flagging known nested keys', () => {
        const unknown = findUnknownConfigKeys({
            format: {
                indentSize: 2,
                alignFieldNames: true,
                nope: true
            },
            lint: {
                severity: 'warning',
                extra: true
            },
            diagnostics: {
                rules: {},
                extra: true
            },
            mystery: 1
        });

        assert.deepStrictEqual(unknown, [
            'format.nope',
            'lint.extra',
            'diagnostics.extra',
            'mystery'
        ]);
    });

    it('validates shared values consistently', () => {
        assert.deepStrictEqual(validateSharedConfigValue('format.indentSize', 2), {valid: true});
        assert.strictEqual(validateSharedConfigValue('format.indentSize', 0).valid, false);
        assert.strictEqual(validateSharedConfigValue('format.trailingComma', 'always').valid, false);
        assert.strictEqual(validateSharedConfigValue('lint.severity', 'debug').valid, false);
        assert.strictEqual(validateSharedConfigValue('diagnostics.rules', {}).valid, true);
        assert.strictEqual(validateSharedConfigValue('unknown.key', 'anything').valid, true);
    });
});
