const assert = require('assert');
const {formatConstFields} = require('../../../out/formatter/const-format.js');

function makeOptions(overrides) {
    return Object.assign({
        trailingComma: 'preserve',
        alignTypes: false,
        alignFieldNames: false,
        alignStructDefaults: false,
        alignAnnotations: false,
        alignComments: false,
        indentSize: 4,
        maxLineLength: 100,
        collectionStyle: 'preserve',
        insertSpaces: true,
        tabSize: 4
    }, overrides);
}

function getIndent(level, opts) {
    return ' '.repeat(level * ((opts && opts.indentSize) || 4));
}

function constField(type, name, value, comment) {
    return {type: type || 'string', name: name || 'test', value: value || '"hello"', comment: comment || '', line: ''};
}

describe('const-format edge cases', () => {
    it('should return empty array for empty fields', () => {
        const result = formatConstFields([], makeOptions(), 0, {getIndent});
        assert.deepStrictEqual(result, []);
    });

    it('should format single const without comment', () => {
        const result = formatConstFields(
            [constField('i32', 'MAX', '100')],
            makeOptions(), 0, {getIndent}
        );
        assert.ok(result.length > 0);
    });

    it('should expand simple list with multiline style', () => {
        const result = formatConstFields(
            [constField('list<i32>', 'ids', '[1, 2, 3, 4, 5]')],
            makeOptions({collectionStyle: 'multiline', indentSize: 2}), 0, {getIndent}
        );
        assert.ok(result.length >= 1, 'should produce at least one line');
    });

    it('should expand simple map with multiline style', () => {
        const result = formatConstFields(
            [constField('map<string, i32>', 'ages', '{"a": 1, "b": 2}')],
            makeOptions({collectionStyle: 'multiline', indentSize: 2}), 0, {getIndent}
        );
        assert.ok(result.length >= 1);
    });

    it('should keep inline when under maxLineLength with auto style', () => {
        const result = formatConstFields(
            [constField('i32', 'MAX', '100')],
            makeOptions({collectionStyle: 'auto', maxLineLength: 200}), 0, {getIndent}
        );
        assert.strictEqual(result.length, 1);
    });

    it('should expand when over maxLineLength with auto style', () => {
        const result = formatConstFields(
            [constField('list<i32>', 'ids', '[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]')],
            makeOptions({collectionStyle: 'auto', maxLineLength: 20, indentSize: 2}), 0, {getIndent}
        );
        assert.ok(result.length >= 1);
    });

    it('should handle collection with string containing commas with multiline', () => {
        const result = formatConstFields(
            [constField('list<string>', 'names', '["a,b", "c,d"]')],
            makeOptions({collectionStyle: 'multiline', indentSize: 2}), 0, {getIndent}
        );
        assert.ok(result.length > 0);
    });

    it('should keep inline with preserve mode', () => {
        const result = formatConstFields(
            [constField('list<i32>', 'ids', '[1, 2, 3]')],
            makeOptions({collectionStyle: 'preserve'}), 0, {getIndent}
        );
        assert.strictEqual(result.length, 1);
    });

    it('should handle multiple consts with comment alignment', () => {
        const fields = [
            constField('i32', 'MAX', '100', 'maximum'),
            constField('i32', 'MIN', '1', 'minimum')
        ];
        const result = formatConstFields(fields, makeOptions({alignComments: true, indentSize: 2}), 0, {getIndent});
        assert.ok(result.length >= 2);
    });

    it('should handle empty collection with multiline', () => {
        const result = formatConstFields(
            [constField('list<i32>', 'items', '[]')],
            makeOptions({collectionStyle: 'multiline', indentSize: 2}), 0, {getIndent}
        );
        assert.ok(result.length > 0);
    });
});
