const assert = require('assert');
const {ThriftParser} = require('../../../../out/ast/parser.js');

describe('function-range-multiline', () => {
    it('should pass all test assertions', () => {
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

        const parser = new ThriftParser(content);
        const ast = parser.parse();
        const func = ast.body[0]?.functions?.[0];

        assert.ok(func?.range, 'Function should include a range');
        assert.strictEqual(func.range.end.line, 6);
        assert.strictEqual(func.range.end.character, 2);
    });
});