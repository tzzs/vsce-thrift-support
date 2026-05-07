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
        alignEnumNames: false,
        alignEnumEquals: false,
        alignEnumValues: false,
        indentSize: 4,
        maxLineLength: 100,
        collectionStyle: 'preserve',
        insertSpaces: true,
        tabSize: 4
    }, overrides);
}

function makeDeps() {
    return {
        getIndent: (level, opts) => ' '.repeat(level * ((opts && opts.indentSize) || 4))
    };
}

function makeConstField(type, name, value, comment) {
    return {
        type: type || 'string',
        name: name || 'test',
        value: value || '"hello"',
        comment: comment || '',
        line: ''
    };
}

describe('const-format', () => {
    describe('existing tests', () => {
        it('should pass all test assertions', () => {
            const options = {
                insertSpaces: true,
                indentSize: 2,
                tabSize: 2,
                collectionStyle: 'preserve',
                maxLineLength: 100,
                alignComments: false
            };
            const deps = {
                getIndent: (level, opts) => ' '.repeat(level * (opts.indentSize || 2))
            };
            const constFields = [
                {type: 'i32', name: 'ID', value: '1', comment: '', line: ''}
            ];
            const constLines = formatConstFields(constFields, options, 0, deps);
            assert.deepStrictEqual(constLines, ['const i32 ID = 1'], 'Expected const field to format with base padding');
        });
    });

    describe('basic formatting', () => {
        it('should return empty array for empty fields', () => {
            const result = formatConstFields([], makeOptions(), 0, makeDeps());
            assert.deepStrictEqual(result, []);
        });

        it('should format single const without comment', () => {
            const fields = [makeConstField('string', 'MY_CONST', '"hello"')];
            const result = formatConstFields(fields, makeOptions({indentSize: 2}), 0, makeDeps());
            assert.ok(result.length > 0);
            const line = result[0];
            assert.ok(line.includes('const'));
            assert.ok(line.includes('MY_CONST'));
            assert.ok(line.includes('"hello"'));
        });

        it('should format single const with comment and alignComments', () => {
            const fields = [makeConstField('i32', 'COUNT', '42', '// the count')];
            const result = formatConstFields(fields, makeOptions({indentSize: 2, alignComments: true}), 0, makeDeps());
            assert.ok(result.length > 0);
            const line = result[0];
            assert.ok(line.includes('// the count'));
        });
    });

    describe('collection expansion - multiline style', () => {
        it('should expand simple list with multiline style', () => {
            const fields = [makeConstField('list<string>', 'ITEMS', '["a", "b", "c"]')];
            const result = formatConstFields(fields, makeOptions({collectionStyle: 'multiline'}), 0, makeDeps());
            assert.strictEqual(result.length, 1);
            // The single output line contains embedded newlines for the expanded collection
            assert.ok(result[0].includes('\n'));
            assert.ok(result[0].includes('['));
            assert.ok(result[0].includes(']'));
            assert.ok(result[0].includes('"a"'));
            assert.ok(result[0].includes('"b"'));
            assert.ok(result[0].includes('"c"'));
        });

        it('should expand simple map with multiline style', () => {
            const fields = [makeConstField('map<string,i32>', 'MAP', '{"key": 1, "key2": 2}')];
            const result = formatConstFields(fields, makeOptions({collectionStyle: 'multiline'}), 0, makeDeps());
            assert.strictEqual(result.length, 1);
            assert.ok(result[0].includes('\n'));
            assert.ok(result[0].includes('{'));
            assert.ok(result[0].includes('}'));
        });
    });

    describe('collection expansion - auto style', () => {
        it('should keep inline when under maxLineLength', () => {
            const fields = [makeConstField('list<string>', 'ITEMS', '["a", "b"]')];
            const result = formatConstFields(fields, makeOptions({collectionStyle: 'auto', maxLineLength: 200}), 0, makeDeps());
            const joined = result.join('\n');
            assert.ok(joined.includes('["a", "b"]'));
        });

        it('should expand when over maxLineLength', () => {
            const fields = [makeConstField('list<string>', 'ITEMS', '["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"]')];
            const result = formatConstFields(fields, makeOptions({collectionStyle: 'auto', maxLineLength: 40}), 0, makeDeps());
            assert.strictEqual(result.length, 1);
            // Should be expanded to multiline (contains newlines)
            assert.ok(result[0].includes('\n'));
        });
    });

    describe('comment alignment in const', () => {
        it('should align inline comments across multiple consts', () => {
            const fields = [
                makeConstField('string', 'A', '"a"', '// first'),
                makeConstField('string', 'BB', '"bb"', '// second')
            ];
            const result = formatConstFields(fields, makeOptions({alignComments: true}), 0, makeDeps());
            const commentPositions = result.map(line => line.indexOf('//'));
            assert.strictEqual(commentPositions.length, 2);
            assert.strictEqual(commentPositions[0], commentPositions[1]);
        });
    });

    describe('edge cases', () => {
        it('should handle collection with string containing commas', () => {
            const fields = [makeConstField('list<string>', 'ITEMS', '["a,b", "c"]')];
            const result = formatConstFields(fields, makeOptions({collectionStyle: 'multiline'}), 0, makeDeps());
            const joined = result.join('\n');
            assert.ok(joined.includes('"a,b"'));
        });

        it('should handle empty collection', () => {
            const fields = [makeConstField('list<string>', 'ITEMS', '[]')];
            const result = formatConstFields(fields, makeOptions({collectionStyle: 'multiline'}), 0, makeDeps());
            const joined = result.join('\n');
            assert.ok(joined.includes('['));
            assert.ok(joined.includes(']'));
        });

        it('should keep inline with preserve mode', () => {
            const fields = [makeConstField('list<string>', 'ITEMS', '["a", "b"]')];
            const result = formatConstFields(fields, makeOptions({collectionStyle: 'preserve'}), 0, makeDeps());
            const joined = result.join('\n');
            assert.ok(joined.includes('["a", "b"]'));
        });
    });
});
