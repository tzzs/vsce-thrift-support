const assert = require('assert');
const path = require('path');

const {
    DEFAULT_THRIFT_FORMATTING_OPTIONS,
    THRIFT_FORMATTING_CONFIG_KEYS,
    THRIFT_FORMATTING_SETTING_DEFINITIONS,
    createFormattingConfigurationProperties,
    normalizeFormattingOptions
} = require('../../../out/config/formatting-options.js');

describe('shared formatting options', () => {
    it('normalizes user-facing alignment switches to formatter options', () => {
        const options = normalizeFormattingOptions({
            alignNames: false,
            alignAssignments: false,
            alignStructDefaults: true
        });

        assert.strictEqual(options.alignFieldNames, false);
        assert.strictEqual(options.alignEnumNames, false);
        assert.strictEqual(options.alignEnumEquals, false);
        assert.strictEqual(options.alignEnumValues, false);
        assert.strictEqual(options.alignStructDefaults, true);
    });

    it('keeps struct defaults independent from alignAssignments', () => {
        const options = normalizeFormattingOptions({
            alignAssignments: false
        });

        assert.strictEqual(options.alignEnumEquals, false);
        assert.strictEqual(options.alignEnumValues, false);
        assert.strictEqual(options.alignStructDefaults, DEFAULT_THRIFT_FORMATTING_OPTIONS.alignStructDefaults);
    });

    it('keeps core setting defaults aligned with package contributions', () => {
        const pkg = require(path.join(process.cwd(), 'package.json'));
        const properties = pkg.contributes.configuration.properties;

        for (const [key, definition] of Object.entries(THRIFT_FORMATTING_SETTING_DEFINITIONS)) {
            const packageKey = `thrift.format.${key}`;
            assert.ok(properties[packageKey], `Expected package contribution for ${packageKey}`);
            assert.deepStrictEqual(properties[packageKey].default, definition.default);
        }
    });

    it('derives VS Code formatting setting metadata from the shared schema', () => {
        const pkg = require(path.join(process.cwd(), 'package.json'));
        const properties = pkg.contributes.configuration.properties;
        const generated = createFormattingConfigurationProperties();

        for (const [key, property] of Object.entries(generated)) {
            assert.deepStrictEqual(properties[key], property);
        }
    });

    it('exposes config keys used by CLI .thriftrc validation', () => {
        assert.ok(THRIFT_FORMATTING_CONFIG_KEYS.includes('alignNames'));
        assert.ok(THRIFT_FORMATTING_CONFIG_KEYS.includes('alignAssignments'));
        assert.ok(THRIFT_FORMATTING_CONFIG_KEYS.includes('alignStructAnnotations'));
    });
});
