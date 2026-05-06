const assert = require('assert');

const {formatEnumContentLine} = require('../../../out/formatter/enum-content.js');
const {parseEnumFieldText} = require('../../../out/formatter/field-parser.js');

describe('enum-content', () => {
    let options;
    let deps;

    beforeEach(() => {
        options = {insertSpaces: true, indentSize: 2, tabSize: 2};
        deps = {
            getIndent: (level) => ' '.repeat(level * 2),
            formatEnumFields: (fields, _opts, indentLevel) =>
                fields.map(f => ' '.repeat(indentLevel * 2) + f.line),
            buildEnumFieldFromAst: () => null,
            parseEnumFieldText,
            isEnumFieldText: (line) => /^[A-Z_]+\s*=/.test(line)
        };
    });

    it('should handle enum field', () => {
        const enumFields = [];
        const enumIndex = new Map();

        const fieldResult = formatEnumContentLine('ACTIVE = 1', 0, 1, enumFields, enumIndex, options, deps);

        assert.strictEqual(fieldResult.handled, true);
        assert.strictEqual(fieldResult.enumFields.length, 1);
    });

    it('should flush enum fields before comment', () => {
        const enumFields = [];
        const enumIndex = new Map();

        const fieldResult = formatEnumContentLine('ACTIVE = 1', 0, 1, enumFields, enumIndex, options, deps);
        const flushResult = formatEnumContentLine('// comment', 1, 1, fieldResult.enumFields, enumIndex, options, deps);

        assert.deepStrictEqual(flushResult.formattedLines, ['  ACTIVE = 1']);
    });

    it('should format close brace and exit enum', () => {
        const enumIndex = new Map();

        const closeResult = formatEnumContentLine('}', 2, 1, [], enumIndex, options, deps);

        assert.deepStrictEqual(closeResult.formattedLines, ['}']);
        assert.strictEqual(closeResult.inEnum, false);
    });
});