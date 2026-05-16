const assert = require('assert');
const {renderConstCollection} = require('../../../out/formatter/const-printer');

describe('renderConstCollection (PrintBuffer-based)', function () {
    const indent4 = '    ';

    it('returns non-collection values unchanged', () => {
        assert.strictEqual(renderConstCollection('"hello"', indent4, 0, 100), '"hello"');
        assert.strictEqual(renderConstCollection('42', indent4, 0, 100), '42');
        assert.strictEqual(renderConstCollection('true', indent4, 0, 100), 'true');
    });

    it('keeps short list inline', () => {
        const result = renderConstCollection('[1, 2, 3]', indent4, 0, 100);
        assert.strictEqual(result, '[1, 2, 3]');
    });

    it('keeps short map inline', () => {
        const result = renderConstCollection('{"a": 1, "b": 2}', indent4, 0, 100);
        assert.strictEqual(result, '{"a": 1, "b": 2}');
    });

    it('expands long list to multiline', () => {
        const items = Array.from({length: 20}, (_, i) => `"item_${i}"`);
        const value = `[${items.join(', ')}]`;
        const result = renderConstCollection(value, indent4, 0, 40);
        assert.ok(result.includes('\n'), 'Should expand to multiline');
        assert.ok(result.startsWith('['));
        assert.ok(result.endsWith(']'));
        for (const item of items) {
            assert.ok(result.includes(item), `Should contain ${item}`);
        }
    });

    it('expands long map to multiline', () => {
        const value = '{"very_long_key_1": "very_long_value_1", "very_long_key_2": "very_long_value_2"}';
        const result = renderConstCollection(value, indent4, 0, 40);
        assert.ok(result.includes('\n'), 'Should expand to multiline');
    });

    it('handles nested collections', () => {
        const value = '{"group1": [1, 2, 3], "group2": [4, 5, 6]}';
        const result = renderConstCollection(value, indent4, 0, 100);
        assert.strictEqual(result, '{"group1": [1, 2, 3], "group2": [4, 5, 6]}');
    });

    it('handles empty collection', () => {
        assert.strictEqual(renderConstCollection('[]', indent4, 0, 100), '[]');
        assert.strictEqual(renderConstCollection('{}', indent4, 0, 100), '{}');
    });

    it('handles single item collection', () => {
        assert.strictEqual(renderConstCollection('[42]', indent4, 0, 100), '[42]');
    });

    it('respects indent level for expanded output', () => {
        const items = Array.from({length: 20}, (_, i) => `"item_${i}"`);
        const value = `[${items.join(', ')}]`;
        const result = renderConstCollection(value, indent4, 1, 40);
        const lines = result.split('\n');
        assert.ok(lines.length > 2);
        assert.ok(lines[1].startsWith('        '), 'Inner items should be indented level+1');
        assert.ok(lines[lines.length - 1].startsWith('    '), 'Closing bracket at base level');
    });

    it('handles strings with commas inside', () => {
        const value = '["hello, world", "foo, bar"]';
        const result = renderConstCollection(value, indent4, 0, 100);
        assert.strictEqual(result, '["hello, world", "foo, bar"]');
    });

    it('multiline input passthrough', () => {
        const value = '[\n    "a",\n    "b"\n]';
        assert.strictEqual(renderConstCollection(value, indent4, 0, 100), value);
    });
});
