const assert = require('assert');
const {ThriftFormatter} = require('../../../out/formatter');
const {ThriftParser} = require('../../../out/ast/parser');

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

function assertNoThrow(input, label) {
    const formatter = new ThriftFormatter();
    let output;
    assert.doesNotThrow(() => {
        output = formatter.format(input, DEFAULT_OPTIONS);
    }, `Formatter threw on [${label}]`);
    assert.strictEqual(typeof output, 'string', `Output should be string [${label}]`);
    return output;
}

function assertParseable(output, label) {
    assert.doesNotThrow(() => {
        const parser = new ThriftParser(output);
        parser.parse();
    }, `Parser threw on formatted output [${label}]`);
}

describe('Malformed input resilience', function () {
    this.timeout(30000);

    describe('unclosed braces', () => {
        it('struct with unclosed brace', () => {
            const output = assertNoThrow('struct Broken {\n    1: i32 id\n', 'unclosed-struct');
            assertParseable(output, 'unclosed-struct');
        });

        it('enum with unclosed brace', () => {
            const output = assertNoThrow('enum Status {\n    OK = 0\n', 'unclosed-enum');
            assertParseable(output, 'unclosed-enum');
        });

        it('service with unclosed brace', () => {
            const output = assertNoThrow('service Svc {\n    void ping()\n', 'unclosed-service');
            assertParseable(output, 'unclosed-service');
        });

        it('nested unclosed braces', () => {
            const output = assertNoThrow(
                'struct A {\n    1: i32 id\nstruct B {\n    1: string name\n',
                'nested-unclosed'
            );
            assertParseable(output, 'nested-unclosed');
        });
    });

    describe('missing field IDs', () => {
        it('struct field without ID', () => {
            const output = assertNoThrow('struct A {\n    required i32 id\n    optional string name\n}', 'no-field-id');
            assertParseable(output, 'no-field-id');
        });
    });

    describe('duplicate field IDs', () => {
        it('struct with duplicate IDs', () => {
            const output = assertNoThrow(
                'struct A {\n    1: i32 id\n    1: string name\n    2: bool flag\n}',
                'duplicate-ids'
            );
            assertParseable(output, 'duplicate-ids');
        });
    });

    describe('deep nesting', () => {
        it('deeply nested container type (10 levels)', () => {
            let type = 'i32';
            for (let i = 0; i < 10; i++) {
                type = `list<${type}>`;
            }
            const output = assertNoThrow(`struct Deep {\n    1: ${type} field\n}`, 'deep-nesting');
            assertParseable(output, 'deep-nesting');
        });

        it('deeply nested map type', () => {
            let type = 'i32';
            for (let i = 0; i < 5; i++) {
                type = `map<string, ${type}>`;
            }
            const output = assertNoThrow(`typedef ${type} DeepMap`, 'deep-map');
            assertParseable(output, 'deep-map');
        });
    });

    describe('extreme inputs', () => {
        it('very long single line (10K chars)', () => {
            const longName = 'x'.repeat(10000);
            const output = assertNoThrow(`struct S {\n    1: i32 ${longName}\n}`, 'long-line');
            assert.ok(output.length > 10000);
        });

        it('empty input', () => {
            const output = assertNoThrow('', 'empty');
            assert.strictEqual(output, '');
        });

        it('only whitespace', () => {
            assertNoThrow('    \n\n   \t\n', 'whitespace-only');
        });

        it('only comments (pure comment file)', () => {
            const output = assertNoThrow(
                '// comment 1\n# comment 2\n/* block */\n/** doc */\n',
                'comments-only'
            );
            assertParseable(output, 'comments-only');
        });

        it('single character', () => {
            assertNoThrow('x', 'single-char');
        });

        it('binary garbage', () => {
            assertNoThrow('\x00\x01\x02\xff\xfe', 'binary-garbage');
        });
    });

    describe('syntax errors', () => {
        it('random text not valid thrift', () => {
            const output = assertNoThrow(
                'this is not valid thrift at all\nfoo bar baz',
                'random-text'
            );
            assert.strictEqual(typeof output, 'string');
        });

        it('incomplete typedef', () => {
            assertNoThrow('typedef', 'incomplete-typedef');
        });

        it('incomplete struct keyword', () => {
            assertNoThrow('struct', 'incomplete-struct');
        });

        it('mismatched angle brackets in generics', () => {
            const output = assertNoThrow('struct S {\n    1: list<map<string, i32> field\n}', 'mismatched-angles');
            assertParseable(output, 'mismatched-angles');
        });

        it('extra closing braces', () => {
            const output = assertNoThrow('struct A {\n    1: i32 id\n}\n}\n}', 'extra-close');
            assertParseable(output, 'extra-close');
        });
    });

    describe('mixed valid and invalid content', () => {
        it('valid struct followed by garbage', () => {
            const output = assertNoThrow(
                'struct Valid {\n    1: i32 id\n}\n\ngarbage line here\n\nstruct Also {\n    1: string x\n}',
                'mixed-valid-garbage'
            );
            assertParseable(output, 'mixed-valid-garbage');
        });

        it('valid content with embedded null bytes', () => {
            assertNoThrow('struct S {\n    1: i32 id\x00\n}', 'null-bytes');
        });
    });
});
