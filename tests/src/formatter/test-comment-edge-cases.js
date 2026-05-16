const assert = require('assert');
const {ThriftFormatter} = require('../../../out/formatter');
const {buildCommentMap, getInlineComment} = require('../../../out/formatter/comment-map');
const {ThriftParser} = require('../../../out/ast/parser');
const {buildAstIndex} = require('../../../out/formatter/ast-index');

const DEFAULT_OPTIONS = {
    trailingComma: 'preserve',
    alignTypes: true,
    alignFieldNames: true,
    alignStructDefaults: false,
    alignAnnotations: true,
    alignComments: true,
    alignEnumNames: true,
    alignEnumEquals: true,
    alignEnumValues: true,
    indentSize: 4,
    maxLineLength: 100,
    collectionStyle: 'preserve',
    insertSpaces: true,
    tabSize: 4
};

function format(input, options) {
    return new ThriftFormatter().format(input, options || DEFAULT_OPTIONS);
}

function buildMap(source) {
    const ast = new ThriftParser(source).parse();
    const astIndex = buildAstIndex(ast);
    return buildCommentMap(source, astIndex);
}

describe('CommentMap construction', function () {
    it('extracts line comments', () => {
        const map = buildMap('// hello\nstruct A {\n    1: i32 id // inline\n}');
        assert.strictEqual(map.all.length, 2);
        assert.strictEqual(map.all[0].kind, 'line');
        assert.strictEqual(map.all[0].position, 'leading');
        assert.strictEqual(map.all[1].kind, 'line');
        assert.strictEqual(map.all[1].position, 'inline');
    });

    it('extracts hash comments', () => {
        const map = buildMap('# hash\nstruct A {\n    1: i32 id # field\n}');
        assert.strictEqual(map.all.length, 2);
        assert.strictEqual(map.all[0].kind, 'line');
        assert.strictEqual(map.all[1].kind, 'line');
        assert.strictEqual(map.all[1].position, 'inline');
    });

    it('extracts block comments', () => {
        const map = buildMap('/* block */\nstruct A {\n    1: i32 id\n}');
        assert.strictEqual(map.all.length, 1);
        assert.strictEqual(map.all[0].kind, 'block');
    });

    it('extracts doc comments', () => {
        const map = buildMap('/**\n * doc\n */\nstruct A {\n    1: i32 id\n}');
        assert.ok(map.all.length >= 1);
        const docComments = map.all.filter(c => c.kind === 'doc');
        assert.ok(docComments.length >= 1);
    });

    it('classifies inline comments correctly', () => {
        const map = buildMap('struct A {\n    1: i32 id // inline comment\n}');
        const lineComments = map.byLine.get(1);
        assert.ok(lineComments);
        assert.strictEqual(lineComments[0].position, 'inline');
    });

    it('classifies leading comments correctly', () => {
        const map = buildMap('// leading\nstruct A {\n    1: i32 id\n}');
        const lineComments = map.byLine.get(0);
        assert.ok(lineComments);
        assert.strictEqual(lineComments[0].position, 'leading');
    });

    it('getInlineComment returns inline text', () => {
        const map = buildMap('struct A {\n    1: i32 id // my comment\n}');
        const comment = getInlineComment(1, map);
        assert.ok(comment.includes('my comment'));
    });

    it('getInlineComment returns empty for no comment', () => {
        const map = buildMap('struct A {\n    1: i32 id\n}');
        const comment = getInlineComment(1, map);
        assert.strictEqual(comment, '');
    });

    it('handles multi-line block comment spanning lines', () => {
        const source = '/*\n * line 1\n * line 2\n */\nstruct A { 1: i32 id }';
        const map = buildMap(source);
        const blockComments = map.all.filter(c => c.kind === 'block' || c.kind === 'doc');
        assert.ok(blockComments.length >= 1);
    });

    it('handles file with only comments', () => {
        const map = buildMap('// line\n# hash\n/* block */\n/** doc */');
        assert.ok(map.all.length >= 3);
    });
});

describe('Comment edge cases in formatting', function () {
    it('comment between two struct fields that trigger flush', () => {
        const input = [
            'struct A {',
            '    1: i32 a, // comment a',
            '    // separator comment',
            '    2: i32 b  // comment b',
            '}'
        ].join('\n');
        const output = format(input);
        assert.ok(output.includes('separator comment'), 'Should preserve separator comment');
        assert.ok(output.includes('comment a'), 'Should preserve inline comment a');
        assert.ok(output.includes('comment b'), 'Should preserve inline comment b');
    });

    it('file ending without newline after comment', () => {
        const input = 'struct A {\n    1: i32 id\n}\n// trailing';
        const output = format(input);
        assert.ok(output.includes('trailing'), 'Should preserve trailing comment');
    });

    it('empty struct body with dangling comment', () => {
        const input = 'struct Empty {\n    // dangling inside\n}';
        const output = format(input);
        assert.ok(output.includes('dangling inside'), 'Should preserve dangling comment');
    });

    it('block comment crossing struct boundary (malformed)', () => {
        const input = '/* start\nstruct A {\n    1: i32 id\n}\nend */';
        const formatter = new ThriftFormatter();
        assert.doesNotThrow(() => formatter.format(input, DEFAULT_OPTIONS));
    });

    it('consecutive empty lines between comments', () => {
        const input = '// first\n\n\n// second\nstruct A {\n    1: i32 id\n}';
        const output = format(input);
        assert.ok(output.includes('first'));
        assert.ok(output.includes('second'));
    });

    it('CJK comment with special punctuation', () => {
        const input = 'struct A {\n    1: i32 id // 用户ID（唯一）\n}';
        const output = format(input);
        assert.ok(output.includes('用户ID（唯一）'));
    });

    it('comment after closing brace', () => {
        const input = 'struct A {\n    1: i32 id\n} // end of A';
        const output = format(input);
        assert.ok(output.includes('end of A'));
    });

    it('doc comment before service method preserved', () => {
        const input = [
            'service Svc {',
            '    /**',
            '     * Get by ID',
            '     */',
            '    i32 get(1: i32 id)',
            '}'
        ].join('\n');
        const output = format(input);
        assert.ok(output.includes('Get by ID'));
    });

    it('inline comment on enum member', () => {
        const input = 'enum E {\n    A = 1, // first\n    B = 2  // second\n}';
        const output = format(input);
        assert.ok(output.includes('first'));
        assert.ok(output.includes('second'));
    });

    it('inline comment on const', () => {
        const input = 'const i32 MAX = 100 // maximum value';
        const output = format(input);
        assert.ok(output.includes('maximum value'));
    });
});
