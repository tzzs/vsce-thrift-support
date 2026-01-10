const assert = require('assert');
const {ThriftParser} = require('../../../../out/ast/parser.js');

describe('invalid-nodes', () => {
    it('should pass all test assertions', () => {
        const content = [
            'namespace java',
            'include shared.thrift',
            'struct {',
            '}',
            'const = 1',
            'typedef list<string>'
        ].join('\n');

        const parser = new ThriftParser(content);
        const ast = parser.parse();
        const invalidNodes = ast.body.filter(n => n.type === 'Invalid');

        assert.ok(invalidNodes.length >= 3, 'Should create invalid nodes for broken declarations');
        assert.ok(invalidNodes.some(node => node.raw.includes('namespace')));
        assert.ok(invalidNodes.some(node => node.raw.includes('include')));
        assert.ok(invalidNodes.some(node => node.raw.includes('const')));
    });
});