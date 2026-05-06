const assert = require('assert');
const {ThriftParser} = require('../../../../out/ast/parser.js');

describe('inline-empty-body', () => {
    it('should stop at inline empty structs and services', () => {
        const content = [
            'struct EmptyStruct {}',
            'struct NextStruct {',
            '  1: i32 id',
            '}',
            'service EmptyService {}',
            'service NextService {',
            '  void ping()',
            '}'
        ].join('\n');

        const ast = new ThriftParser(content).parse();
        const emptyStruct = ast.body.find(node => node.type === 'Struct' && node.name === 'EmptyStruct');
        const nextStruct = ast.body.find(node => node.type === 'Struct' && node.name === 'NextStruct');
        const emptyService = ast.body.find(node => node.type === 'Service' && node.name === 'EmptyService');
        const nextService = ast.body.find(node => node.type === 'Service' && node.name === 'NextService');

        assert.ok(emptyStruct);
        assert.ok(nextStruct);
        assert.ok(emptyService);
        assert.ok(nextService);

        assert.strictEqual(emptyStruct.fields.length, 0);
        assert.strictEqual(nextStruct.fields.length, 1);
        assert.strictEqual(emptyService.functions.length, 0);
        assert.strictEqual(nextService.functions.length, 1);
    });
});
