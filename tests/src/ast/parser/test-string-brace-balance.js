const assert = require('assert');
const {ThriftParser} = require('../../../../out/ast/parser.js');

describe('string-brace-balance', () => {
    it('should ignore braces inside string literals when tracking blocks', () => {
        const content = [
            'struct Template {',
            '  1: string tmpl = "{{value}",',
            '}',
            'struct NextStruct {',
            '  1: i32 id',
            '}'
        ].join('\n');

        const ast = new ThriftParser(content).parse();
        const templateStruct = ast.body.find(node => node.type === 'Struct' && node.name === 'Template');
        const nextStruct = ast.body.find(node => node.type === 'Struct' && node.name === 'NextStruct');

        assert.ok(templateStruct);
        assert.ok(nextStruct);
        assert.strictEqual(templateStruct.fields.length, 1);
        assert.strictEqual(nextStruct.fields.length, 1);
    });
});
