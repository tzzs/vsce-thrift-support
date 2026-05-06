/* eslint-disable curly */
const assert = require('assert');
const {ThriftParser} = require('../../../../out/ast/parser.js');

function sliceByRange(lines, range) {
    if (!range) return null;
    if (range.start.line === range.end.line) {
        return lines[range.start.line].slice(range.start.character, range.end.character);
    }
    const parts = [];
    for (let line = range.start.line; line <= range.end.line; line++) {
        const text = lines[line] ?? '';
        if (line === range.start.line) {
            parts.push(text.slice(range.start.character));
        } else if (line === range.end.line) {
            parts.push(text.slice(0, range.end.character));
        } else {
            parts.push(text);
        }
    }
    return parts.join('\n');
}

describe('Function argument ranges', () => {
    it('should extract correct ranges for function arguments and throws', () => {
        const content = [
            'service S {',
            '  User getUser(',
            '    1: map<string, i32> ids,',
            '    2: optional string name',
            '  ) throws (',
            '    1: Error err',
            '  )',
            '}'
        ].join('\n');

        const lines = content.split('\n');
        const parser = new ThriftParser(content);
        const ast = parser.parse();
        const serviceNode = ast.body.find((n) => n.type === 'Service');
        const func = serviceNode?.functions?.[0];

        const argOne = func?.arguments?.[0];
        const argTwo = func?.arguments?.[1];
        const throwOne = func?.throws?.[0];

        assert.strictEqual(sliceByRange(lines, argOne?.typeRange)?.trim(), 'map<string, i32>');
        assert.strictEqual(sliceByRange(lines, argOne?.nameRange)?.trim(), 'ids');
        assert.strictEqual(sliceByRange(lines, argTwo?.typeRange)?.trim(), 'string');
        assert.strictEqual(sliceByRange(lines, argTwo?.nameRange)?.trim(), 'name');

        assert.strictEqual(sliceByRange(lines, throwOne?.typeRange)?.trim(), 'Error');
        assert.strictEqual(sliceByRange(lines, throwOne?.nameRange)?.trim(), 'err');
    });
});