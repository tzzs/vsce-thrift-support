const assert = require('assert');
const {ThriftParser} = require('../../../../out/ast/parser.js');

describe('block-comments', () => {
    it('should ignore top-level declarations inside block comments', () => {
        const content = [
            '/*',
            'struct Ghost {',
            '}',
            'service Fake {',
            '}',
            '*/',
            'struct Real {',
            '}'
        ].join('\n');

        const parser = new ThriftParser(content);
        const ast = parser.parse();
        const names = ast.body
            .filter(node => node.type === 'Struct' || node.type === 'Service')
            .map(node => node.name);

        assert.ok(!names.includes('Ghost'), 'Block-commented struct should be ignored');
        assert.ok(!names.includes('Fake'), 'Block-commented service should be ignored');
        assert.ok(names.includes('Real'), 'Real struct should be parsed');
    });

    it('should parse declarations after inline block comment end', () => {
        const content = [
            '/* struct Hidden { } */',
            'struct Visible {',
            '}'
        ].join('\n');

        const parser = new ThriftParser(content);
        const ast = parser.parse();
        const names = ast.body
            .filter(node => node.type === 'Struct')
            .map(node => node.name);

        assert.ok(!names.includes('Hidden'), 'Inline block comment should be ignored');
        assert.ok(names.includes('Visible'), 'Visible struct should be parsed');
    });
});
