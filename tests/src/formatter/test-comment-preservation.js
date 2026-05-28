const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {ThriftFormatter} = require('../../../out/formatter');
const {tokenizeText} = require('../../../out/ast/tokenizer');

const FIXTURE_DIR = path.join(__dirname, '..', '..', '..', 'test-files');

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

function extractComments(text) {
    return tokenizeText(text)
        .filter(t => t.type === 'comment')
        .map(t => t.value);
}

function normalizeComment(c) {
    return c
        .replace(/^\/\/\s*/, '')
        .replace(/^#\s*/, '')
        .replace(/^\/\*+\s*/, '')
        .replace(/\s*\*+\/$/, '')
        .replace(/^\s*\*\s?/gm, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function extractNormalizedCommentSet(text) {
    const comments = extractComments(text);
    return comments
        .map(normalizeComment)
        .filter(c => c.length > 0);
}

function assertCommentsPreserved(input, options, label) {
    const formatter = new ThriftFormatter();
    const formatted = formatter.format(input, options);

    const origComments = extractNormalizedCommentSet(input);
    const fmtComments = extractNormalizedCommentSet(formatted);

    const origSet = new Set(origComments);
    const fmtSet = new Set(fmtComments);

    const lost = origComments.filter(c => !fmtSet.has(c));
    const added = fmtComments.filter(c => !origSet.has(c));

    const hasLoss = lost.length > 0;
    const hasDupes = fmtComments.length > origComments.length;

    if (hasLoss || hasDupes) {
        let msg = `Comment preservation failed [${label}]:`;
        if (hasLoss) {
            msg += `\n  Lost comments (${lost.length}): ${JSON.stringify(lost.slice(0, 5))}`;
        }
        if (hasDupes) {
            msg += `\n  Comment count: original=${origComments.length}, formatted=${fmtComments.length}`;
        }
        if (added.length > 0) {
            msg += `\n  New comments (${added.length}): ${JSON.stringify(added.slice(0, 5))}`;
        }
        assert.fail(msg);
    }
}

describe('Comment preservation', function () {
    this.timeout(60000);

    describe('fixture files', () => {
        const fixtureFiles = [
            'thrift_full_coverage.thrift',
            'example.thrift',
            'advanced-features.thrift',
            'annotation-edge-cases.thrift',
            'main.thrift',
            'shared.thrift',
            'example-enum.thrift'
        ];

        for (const file of fixtureFiles) {
            const filePath = path.join(FIXTURE_DIR, file);
            if (!fs.existsSync(filePath)) {
                continue;
            }
            it(`${file}`, () => {
                const content = fs.readFileSync(filePath, 'utf-8');
                assertCommentsPreserved(content, DEFAULT_OPTIONS, file);
            });
        }
    });

    describe('line comments (//)', () => {
        it('inline comment on struct field', () => {
            assertCommentsPreserved(
                'struct A {\n    1: i32 id, // unique id\n    2: string name // display name\n}',
                DEFAULT_OPTIONS, 'inline-struct'
            );
        });

        it('standalone comment before struct', () => {
            assertCommentsPreserved(
                '// User definition\nstruct User {\n    1: i32 id\n}',
                DEFAULT_OPTIONS, 'standalone-before'
            );
        });

        it('comment between fields', () => {
            assertCommentsPreserved(
                'struct A {\n    1: i32 a\n    // separator\n    2: i32 b\n}',
                DEFAULT_OPTIONS, 'between-fields'
            );
        });

        it('comment at end of file', () => {
            assertCommentsPreserved(
                'struct A {\n    1: i32 id\n}\n// end of file',
                DEFAULT_OPTIONS, 'eof-comment'
            );
        });

        it('multiple consecutive line comments', () => {
            assertCommentsPreserved(
                '// line 1\n// line 2\n// line 3\nstruct A {\n    1: i32 id\n}',
                DEFAULT_OPTIONS, 'consecutive-comments'
            );
        });
    });

    describe('hash comments (#)', () => {
        it('hash inline comment', () => {
            assertCommentsPreserved(
                'struct A {\n    1: i32 id # identifier\n}',
                DEFAULT_OPTIONS, 'hash-inline'
            );
        });

        it('standalone hash comment', () => {
            assertCommentsPreserved(
                '# top level hash comment\nstruct A {\n    1: i32 id\n}',
                DEFAULT_OPTIONS, 'hash-standalone'
            );
        });
    });

    describe('block comments (/* */)', () => {
        it('single-line block comment', () => {
            assertCommentsPreserved(
                '/* block comment */\nstruct A {\n    1: i32 id\n}',
                DEFAULT_OPTIONS, 'block-single-line'
            );
        });

        it('multi-line block comment', () => {
            assertCommentsPreserved(
                '/*\n * Multi-line\n * block comment\n */\nstruct A {\n    1: i32 id\n}',
                DEFAULT_OPTIONS, 'block-multi-line'
            );
        });
    });

    describe('doc comments (/** */)', () => {
        it('doc comment before struct', () => {
            assertCommentsPreserved(
                '/**\n * User struct\n * @param id the identifier\n */\nstruct User {\n    1: i32 id\n}',
                DEFAULT_OPTIONS, 'doc-before-struct'
            );
        });

        it('doc comment before service method', () => {
            assertCommentsPreserved(
                'service Svc {\n    /**\n     * Get user by ID\n     */\n    User getUser(1: i32 id)\n}',
                DEFAULT_OPTIONS, 'doc-before-method'
            );
        });

        it('doc comments on multiple methods', () => {
            assertCommentsPreserved(
                [
                    'service Svc {',
                    '    /**',
                    '     * Create',
                    '     */',
                    '    void create(1: i32 id),',
                    '',
                    '    /**',
                    '     * Delete',
                    '     */',
                    '    void delete(1: i32 id)',
                    '}'
                ].join('\n'),
                DEFAULT_OPTIONS, 'doc-multiple-methods'
            );
        });
    });

    describe('CJK and special characters', () => {
        it('CJK comments preserved', () => {
            assertCommentsPreserved(
                'struct User {\n    1: i32 id, // 用户唯一标识\n    2: string name // ユーザー名\n}',
                DEFAULT_OPTIONS, 'cjk-comments'
            );
        });

        it('comments with special characters', () => {
            assertCommentsPreserved(
                'struct A {\n    1: i32 id // id (unique) [required]\n}',
                DEFAULT_OPTIONS, 'special-chars'
            );
        });
    });

    describe('comments in various positions', () => {
        it('comment before enum members', () => {
            assertCommentsPreserved(
                'enum Status {\n    // Success codes\n    OK = 0,\n    // Error codes\n    ERROR = 1\n}',
                DEFAULT_OPTIONS, 'enum-member-comments'
            );
        });

        it('inline comments on enum members', () => {
            assertCommentsPreserved(
                'enum Status {\n    OK = 0, // success\n    ERROR = 1 // failure\n}',
                DEFAULT_OPTIONS, 'enum-inline-comments'
            );
        });

        it('comments between top-level definitions', () => {
            assertCommentsPreserved(
                'struct A {\n    1: i32 id\n}\n\n// Next struct\n\nstruct B {\n    1: i32 id\n}',
                DEFAULT_OPTIONS, 'between-definitions'
            );
        });

        it('comment after namespace', () => {
            assertCommentsPreserved(
                'namespace cpp test // test namespace\n\nstruct A {\n    1: i32 id\n}',
                DEFAULT_OPTIONS, 'after-namespace'
            );
        });

        it('comment after include', () => {
            assertCommentsPreserved(
                'include "shared.thrift" // shared types\n\nstruct A {\n    1: i32 id\n}',
                DEFAULT_OPTIONS, 'after-include'
            );
        });
    });

    describe('edge cases', () => {
        it('empty struct with dangling comment', () => {
            assertCommentsPreserved(
                'struct Empty {\n    // nothing here\n}',
                DEFAULT_OPTIONS, 'empty-struct-comment'
            );
        });

        it('file with only comments', () => {
            assertCommentsPreserved(
                '// line comment\n# hash comment\n/* block comment */\n/** doc comment */',
                DEFAULT_OPTIONS, 'only-comments'
            );
        });

        it('comment immediately after opening brace', () => {
            assertCommentsPreserved(
                'struct A { // struct comment\n    1: i32 id\n}',
                DEFAULT_OPTIONS, 'after-brace'
            );
        });

        it('comment on const definition', () => {
            assertCommentsPreserved(
                'const i32 MAX = 100 // max value\nconst string NAME = "test" // name',
                DEFAULT_OPTIONS, 'const-comments'
            );
        });

        it('semicolon-style comments in enum', () => {
            assertCommentsPreserved(
                'enum E {\n    A = 1; // first\n    B = 2; // second\n}',
                DEFAULT_OPTIONS, 'semicolon-enum-comments'
            );
        });
    });

    describe('config variations', () => {
        const input = [
            '// header comment',
            'struct User {',
            '    1: required i32 id, // unique id',
            '    2: optional string name // display name',
            '}',
            '// footer'
        ].join('\n');

        it('trailingComma=add preserves comments', () => {
            assertCommentsPreserved(input, {...DEFAULT_OPTIONS, trailingComma: 'add'}, 'trailing-add');
        });

        it('trailingComma=remove preserves comments', () => {
            assertCommentsPreserved(input, {...DEFAULT_OPTIONS, trailingComma: 'remove'}, 'trailing-remove');
        });

        it('all alignment off preserves comments', () => {
            assertCommentsPreserved(input, {
                ...DEFAULT_OPTIONS,
                alignTypes: false, alignFieldNames: false,
                alignAnnotations: false, alignComments: false
            }, 'align-off');
        });

        it('indent=2 preserves comments', () => {
            assertCommentsPreserved(input, {...DEFAULT_OPTIONS, indentSize: 2, tabSize: 2}, 'indent-2');
        });

        it('tabs preserves comments', () => {
            assertCommentsPreserved(input, {...DEFAULT_OPTIONS, insertSpaces: false}, 'tabs');
        });
    });
});
