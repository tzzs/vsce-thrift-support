const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {ThriftFormatter} = require('../../../out/formatter');

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

const CONFIG_MATRIX = {
    'default': DEFAULT_OPTIONS,
    'all-align-off': {
        ...DEFAULT_OPTIONS,
        alignTypes: false,
        alignFieldNames: false,
        alignStructDefaults: false,
        alignAnnotations: false,
        alignComments: false,
        alignEnumNames: false,
        alignEnumEquals: false,
        alignEnumValues: false
    },
    'trailingComma-add': {
        ...DEFAULT_OPTIONS,
        trailingComma: 'add'
    },
    'trailingComma-remove': {
        ...DEFAULT_OPTIONS,
        trailingComma: 'remove'
    },
    'indent-2': {
        ...DEFAULT_OPTIONS,
        indentSize: 2,
        tabSize: 2
    },
    'tabs': {
        ...DEFAULT_OPTIONS,
        insertSpaces: false,
        tabSize: 4
    },
    'collection-multiline': {
        ...DEFAULT_OPTIONS,
        collectionStyle: 'multiline'
    },
    'collection-auto': {
        ...DEFAULT_OPTIONS,
        collectionStyle: 'auto'
    },
    'alignStructDefaults-on': {
        ...DEFAULT_OPTIONS,
        alignStructDefaults: true
    }
};

function assertIdempotent(input, options, label) {
    const formatter = new ThriftFormatter();
    const once = formatter.format(input, options);
    const twice = formatter.format(once, options);
    assert.strictEqual(once, twice,
        `Not idempotent [${label}]:\n` +
        `--- first pass ---\n${once.slice(0, 500)}\n` +
        `--- second pass ---\n${twice.slice(0, 500)}`
    );
}

function assertIdempotentAllConfigs(input, label) {
    for (const [configName, options] of Object.entries(CONFIG_MATRIX)) {
        assertIdempotent(input, options, `${label} | config=${configName}`);
    }
}

describe('Exhaustive formatter idempotency', function () {
    this.timeout(60000);

    describe('fixture files', () => {
        const fixtureFiles = [
            'thrift_full_coverage.thrift',
            'example.thrift',
            'advanced-features.thrift',
            'nested-containers.thrift',
            'annotation-edge-cases.thrift',
            'main.thrift',
            'shared.thrift',
            'typedef-test.thrift',
            'example-enum.thrift',
            'method-test.thrift'
        ];

        for (const file of fixtureFiles) {
            const filePath = path.join(FIXTURE_DIR, file);
            if (!fs.existsSync(filePath)) {
                continue;
            }
            for (const [configName, options] of Object.entries(CONFIG_MATRIX)) {
                it(`${file} [${configName}]`, () => {
                    const content = fs.readFileSync(filePath, 'utf-8');
                    assertIdempotent(content, options, `${file} | ${configName}`);
                });
            }
        }
    });

    describe('namespace and include', () => {
        it('multiple namespaces', () => {
            assertIdempotentAllConfigs(
                'namespace cpp my.company\nnamespace java com.mycompany\nnamespace py my_project\nnamespace js my.project',
                'multi-namespace'
            );
        });

        it('includes with various paths', () => {
            assertIdempotentAllConfigs(
                'include "common.thrift"\ninclude "./types/base.thrift"\ninclude "../shared/defs.thrift"',
                'includes'
            );
        });

        it('mixed namespace and include ordering', () => {
            assertIdempotentAllConfigs(
                'namespace cpp test\ninclude "types.thrift"\nnamespace java test\ninclude "shared.thrift"',
                'mixed-ns-include'
            );
        });
    });

    describe('typedef', () => {
        it('simple typedef', () => {
            assertIdempotentAllConfigs('typedef i64 UserId', 'simple-typedef');
        });

        it('nested container typedef', () => {
            assertIdempotentAllConfigs(
                'typedef map<string, list<set<i32>>> ComplexMap',
                'nested-typedef'
            );
        });

        it('chained typedef', () => {
            assertIdempotentAllConfigs(
                'typedef i64 LongId\ntypedef LongId UserId\ntypedef map<string, UserId> UserMap',
                'chained-typedef'
            );
        });
    });

    describe('const', () => {
        it('scalar constants', () => {
            assertIdempotentAllConfigs(
                'const i32 MAX = 100\nconst double PI = 3.14159\nconst string NAME = "hello"\nconst bool FLAG = true',
                'scalar-const'
            );
        });

        it('list constant inline', () => {
            assertIdempotentAllConfigs(
                'const list<i32> NUMS = [1, 2, 3, 4, 5]',
                'list-const-inline'
            );
        });

        it('list constant multiline', () => {
            assertIdempotentAllConfigs(
                'const list<string> ITEMS = [\n    "alpha",\n    "beta",\n    "gamma"\n]',
                'list-const-multiline'
            );
        });

        it('map constant inline', () => {
            assertIdempotentAllConfigs(
                'const map<string, i32> CODES = {"OK": 200, "NOT_FOUND": 404}',
                'map-const-inline'
            );
        });

        it('map constant multiline', () => {
            assertIdempotentAllConfigs(
                'const map<string, i32> CODES = {\n    "OK": 200,\n    "NOT_FOUND": 404,\n    "ERROR": 500\n}',
                'map-const-multiline'
            );
        });

        it('set constant', () => {
            assertIdempotentAllConfigs(
                'const set<string> TAGS = ["a", "b", "c"]',
                'set-const'
            );
        });

        it('nested collection constant', () => {
            assertIdempotentAllConfigs(
                'const map<string, list<i32>> GROUPS = {\n    "g1": [1, 2, 3],\n    "g2": [4, 5, 6]\n}',
                'nested-collection-const'
            );
        });

        it('string with special characters', () => {
            assertIdempotentAllConfigs(
                'const string QUOTE = "This has = signs and commas, ok?"',
                'string-special-chars'
            );
        });
    });

    describe('enum', () => {
        it('basic enum', () => {
            assertIdempotentAllConfigs(
                'enum Status {\n    OK = 0,\n    ERROR = 1\n}',
                'basic-enum'
            );
        });

        it('enum with negative values', () => {
            assertIdempotentAllConfigs(
                'enum Priority {\n    UNKNOWN = -1,\n    LOW = 0,\n    MEDIUM = 1,\n    HIGH = 2\n}',
                'enum-negative'
            );
        });

        it('enum with comments', () => {
            assertIdempotentAllConfigs(
                'enum Status {\n    OK = 0, // success\n    ERROR = 1 // failure\n}',
                'enum-comments'
            );
        });

        it('enum with uneven name lengths', () => {
            assertIdempotentAllConfigs(
                'enum Var {\n    A = 1,\n    BB = 2,\n    CCC = 3,\n    DDDDDDDD = 4\n}',
                'enum-uneven-names'
            );
        });

        it('enum with semicolons', () => {
            assertIdempotentAllConfigs(
                'enum Status {\n    A = 1;\n    B = 2;\n}',
                'enum-semicolons'
            );
        });

        it('enum without explicit values', () => {
            assertIdempotentAllConfigs(
                'enum Color {\n    RED,\n    GREEN,\n    BLUE\n}',
                'enum-no-values'
            );
        });
    });

    describe('struct', () => {
        it('basic struct', () => {
            assertIdempotentAllConfigs(
                'struct User {\n    1: required i32 id\n    2: optional string name\n}',
                'basic-struct'
            );
        });

        it('struct with default values', () => {
            assertIdempotentAllConfigs(
                'struct Config {\n    1: i32 timeout = 30,\n    2: string host = "localhost",\n    3: bool debug = false\n}',
                'struct-defaults'
            );
        });

        it('struct with annotations', () => {
            assertIdempotentAllConfigs(
                'struct User {\n    1: required string name (json_name="user_name"),\n    2: optional i32 age (min=0, max=150)\n}',
                'struct-annotations'
            );
        });

        it('struct with comments', () => {
            assertIdempotentAllConfigs(
                'struct User {\n    1: required i32 id, // unique id\n    2: optional string name, // display name\n    3: optional bool active = true // is active\n}',
                'struct-comments'
            );
        });

        it('struct with collection defaults', () => {
            assertIdempotentAllConfigs(
                'struct Config {\n    1: list<string> tags = ["a", "b"],\n    2: map<string, i32> scores = {"math": 95, "eng": 88},\n    3: set<i32> ids = [1, 2, 3]\n}',
                'struct-collection-defaults'
            );
        });

        it('struct with nested containers', () => {
            assertIdempotentAllConfigs(
                'struct Deep {\n    1: list<map<string, set<i32>>> data\n    2: map<string, list<list<i64>>> groups\n}',
                'struct-nested-containers'
            );
        });

        it('struct with mixed qualifiers', () => {
            assertIdempotentAllConfigs(
                'struct Mixed {\n    1: required i32 id\n    2: optional string name\n    3: i32 age\n}',
                'struct-mixed-qualifiers'
            );
        });

        it('struct-level annotation', () => {
            assertIdempotentAllConfigs(
                'struct Anno (\n    cpp.virtual = "true",\n    java.annotations = "@Data"\n) {\n    1: string field (accessor = "getField")\n}',
                'struct-level-annotation'
            );
        });

        it('empty struct body', () => {
            assertIdempotentAllConfigs('struct Empty {}', 'empty-struct');
        });

        it('single-line struct', () => {
            assertIdempotentAllConfigs(
                'struct Tiny { 1: i32 id }',
                'single-line-struct'
            );
        });

        it('struct with all features combined', () => {
            assertIdempotentAllConfigs(
                [
                    '// User info',
                    'struct User {',
                    '    1: required i64 id = 1001,           // unique id',
                    '    2: required string name (json_name="user_name"), // name',
                    '    3: optional i32 age,                  // age',
                    '    4: optional list<string> tags = ["thrift", "test"], // tags',
                    '    5: optional map<string,i32> scores = {"math": 95}, // scores',
                    '    6: optional bool active = true        // is active',
                    '}'
                ].join('\n'),
                'struct-all-features'
            );
        });
    });

    describe('union', () => {
        it('basic union', () => {
            assertIdempotentAllConfigs(
                'union Value {\n    1: string text,\n    2: i64 number,\n    3: bool flag\n}',
                'basic-union'
            );
        });

        it('union with doc comment', () => {
            assertIdempotentAllConfigs(
                '/**\n * A tagged union\n */\nunion Result {\n    1: string ok,\n    2: string error\n}',
                'union-doc-comment'
            );
        });
    });

    describe('exception', () => {
        it('basic exception', () => {
            assertIdempotentAllConfigs(
                'exception AppError {\n    1: required string message\n    2: optional i32 code\n}',
                'basic-exception'
            );
        });

        it('exception with defaults', () => {
            assertIdempotentAllConfigs(
                'exception NotFound {\n    1: required string message,\n    2: optional i32 code = 404\n}',
                'exception-defaults'
            );
        });
    });

    describe('service', () => {
        it('basic service', () => {
            assertIdempotentAllConfigs(
                'service MyService {\n    void ping(),\n    string echo(1: string msg)\n}',
                'basic-service'
            );
        });

        it('service with extends', () => {
            assertIdempotentAllConfigs(
                'service ChildService extends BaseService {\n    i32 add(1: i32 a, 2: i32 b)\n}',
                'service-extends'
            );
        });

        it('service with throws', () => {
            assertIdempotentAllConfigs(
                'service UserService {\n    User getUser(1: i32 id) throws (1: NotFound err),\n    void deleteUser(1: i32 id) throws (1: NotFound err, 2: AuthError auth)\n}',
                'service-throws'
            );
        });

        it('service with oneway', () => {
            assertIdempotentAllConfigs(
                'service EventService {\n    oneway void notify(1: string topic, 2: string msg)\n}',
                'service-oneway'
            );
        });

        it('service with doc comments on methods', () => {
            assertIdempotentAllConfigs(
                [
                    'service Svc {',
                    '    /**',
                    '     * Create item',
                    '     */',
                    '    Item create(1: Item item),',
                    '',
                    '    /**',
                    '     * Get item by ID',
                    '     */',
                    '    Item get(1: i32 id)',
                    '}'
                ].join('\n'),
                'service-doc-comments'
            );
        });

        it('service with multi-line params', () => {
            assertIdempotentAllConfigs(
                [
                    'service Svc {',
                    '    void doStuff(',
                    '        1: required string traceInfo,',
                    '        2: required Request request',
                    '    )',
                    '}'
                ].join('\n'),
                'service-multiline-params'
            );
        });

        it('service method with annotation', () => {
            assertIdempotentAllConfigs(
                'service Svc {\n    i32 add(1: i32 a, 2: i32 b) (description = "simple addition")\n}',
                'service-method-annotation'
            );
        });
    });

    describe('interaction and performs', () => {
        it('interaction block', () => {
            assertIdempotentAllConfigs(
                'interaction Calculator {\n    i32 add(1: i32 a, 2: i32 b)\n    void reset()\n}',
                'interaction'
            );
        });

        it('performs declaration', () => {
            assertIdempotentAllConfigs(
                'service DataService {\n    performs Calculator calc\n    performs Processor proc\n}',
                'performs'
            );
        });
    });

    describe('dirty / messy inputs', () => {
        it('irregular indentation', () => {
            assertIdempotentAllConfigs(
                'struct Messy {\n1:required i32 id\n      2:  optional    string    name\n   3: bool   flag\n}',
                'dirty-indentation'
            );
        });

        it('missing spaces around colons and types', () => {
            assertIdempotentAllConfigs(
                'struct NoSpaces {\n    1:required i32 id\n    2:optional string name\n    3:i32 age\n}',
                'dirty-no-spaces'
            );
        });

        it('mixed comma and semicolon separators', () => {
            assertIdempotentAllConfigs(
                'struct MixSep {\n    1: i32 a,\n    2: i32 b;\n    3: i32 c\n    4: i32 d,\n}',
                'dirty-mixed-separators'
            );
        });

        it('empty body braces', () => {
            assertIdempotentAllConfigs(
                'struct A {}\nenum B {}\nservice C {}',
                'dirty-empty-bodies'
            );
        });

        it('single-line definitions', () => {
            assertIdempotentAllConfigs(
                'struct A { 1: i32 id, 2: string name }\nenum B { X = 1, Y = 2 }',
                'dirty-single-line'
            );
        });

        it('deeply nested generics with spaces', () => {
            assertIdempotentAllConfigs(
                'typedef map< string , list< set< i32 > > > WeirdSpacing',
                'dirty-generics-spaces'
            );
        });

        it('trailing whitespace and blank lines', () => {
            assertIdempotentAllConfigs(
                'struct Ws {   \n    1: i32 id   \n\n\n    2: string name\n}   ',
                'dirty-trailing-ws'
            );
        });

        it('no newline at end of file', () => {
            assertIdempotentAllConfigs(
                'struct NoEOF {\n    1: i32 id\n}',
                'dirty-no-eof-newline'
            );
        });

        it('extra blank lines between fields', () => {
            assertIdempotentAllConfigs(
                'struct Spaced {\n    1: i32 a\n\n\n\n    2: i32 b\n\n    3: i32 c\n}',
                'dirty-extra-blanks'
            );
        });

        it('tab indentation input with space config', () => {
            assertIdempotentAllConfigs(
                'struct TabMix {\n\t1: i32 id\n\t2: string name\n}',
                'dirty-tab-indent'
            );
        });

        it('very long single line struct field', () => {
            const longName = 'x'.repeat(80);
            assertIdempotentAllConfigs(
                `struct Long {\n    1: map<string, list<map<string, set<i64>>>> ${longName}\n}`,
                'dirty-long-line'
            );
        });

        it('enum with mixed separators and missing values', () => {
            assertIdempotentAllConfigs(
                'enum Mixed {\n    A = 1,\n    B;\n    C = 3\n    D\n}',
                'dirty-enum-mixed'
            );
        });
    });

    describe('comments', () => {
        it('inline comments on struct fields', () => {
            assertIdempotentAllConfigs(
                'struct C {\n    1: i32 a, // comment a\n    2: i32 b  // comment b\n}',
                'comment-inline-struct'
            );
        });

        it('hash-style comments', () => {
            assertIdempotentAllConfigs(
                '# top comment\nstruct A {\n    1: i32 id # field comment\n}',
                'comment-hash'
            );
        });

        it('block comments', () => {
            assertIdempotentAllConfigs(
                '/* block comment */\nstruct A {\n    1: i32 id\n}',
                'comment-block'
            );
        });

        it('doc comments', () => {
            assertIdempotentAllConfigs(
                '/**\n * Documentation\n * @param id the identifier\n */\nstruct A {\n    1: i32 id\n}',
                'comment-doc'
            );
        });

        it('CJK comments', () => {
            assertIdempotentAllConfigs(
                'struct User {\n    1: i32 id, // 用户唯一标识\n    2: string name // ユーザー名\n}',
                'comment-cjk'
            );
        });

        it('comment-only lines between fields', () => {
            assertIdempotentAllConfigs(
                'struct A {\n    1: i32 a\n    // separator\n    2: i32 b\n}',
                'comment-between-fields'
            );
        });

        it('file ending with comment', () => {
            assertIdempotentAllConfigs(
                'struct A {\n    1: i32 id\n}\n// end of file',
                'comment-eof'
            );
        });

        it('comments between top-level definitions', () => {
            assertIdempotentAllConfigs(
                'struct A {\n    1: i32 id\n}\n\n// Next definition\n\nstruct B {\n    1: i32 id\n}',
                'comment-between-defs'
            );
        });
    });

    describe('complex combinations', () => {
        it('full file with all node types', () => {
            assertIdempotentAllConfigs(
                [
                    'namespace cpp test',
                    'include "shared.thrift"',
                    '',
                    'typedef i64 UserId',
                    'typedef map<string, list<i32>> UserScores',
                    '',
                    'const i32 MAX = 100',
                    'const list<string> TAGS = ["a", "b"]',
                    '',
                    'enum Status {',
                    '    OK = 0,',
                    '    ERROR = 1',
                    '}',
                    '',
                    'struct User {',
                    '    1: required UserId id,        // id',
                    '    2: optional string name,      // name',
                    '    3: optional Status status = Status.OK',
                    '}',
                    '',
                    'union Value {',
                    '    1: string text,',
                    '    2: i64 num',
                    '}',
                    '',
                    'exception NotFound {',
                    '    1: string message',
                    '}',
                    '',
                    'service UserService {',
                    '    User getUser(1: UserId id) throws (1: NotFound err),',
                    '    void deleteUser(1: UserId id),',
                    '    oneway void notify(1: string msg)',
                    '}'
                ].join('\n'),
                'full-file-all-types'
            );
        });

        it('struct with annotations, defaults, comments, and collection values', () => {
            assertIdempotentAllConfigs(
                [
                    'struct Complex {',
                    '    1: required i64 id = 1001,                             // unique',
                    '    2: required string name (json_name="n"),               // display name',
                    '    3: optional list<string> tags = ["a", "b"],            // tags',
                    '    4: optional map<string, i32> scores = {"m": 95},       // scores',
                    '    5: optional bool active = true                         // status',
                    '}'
                ].join('\n'),
                'struct-complex-combo'
            );
        });

        it('service extending with multiple method styles', () => {
            assertIdempotentAllConfigs(
                [
                    'service FullService extends BaseService {',
                    '    /**',
                    '     * Simple ping',
                    '     */',
                    '    void ping(),',
                    '',
                    '    // Echo with error',
                    '    string echo(1: string msg) throws (1: AppError err),',
                    '',
                    '    oneway void fire(1: string event),',
                    '',
                    '    list<User> search(',
                    '        1: string query,',
                    '        2: i32 limit = 10,',
                    '        3: i32 offset = 0',
                    '    ),',
                    '',
                    '    i32 add(1: i32 a, 2: i32 b) (desc = "addition")',
                    '}'
                ].join('\n'),
                'service-full-combo'
            );
        });

        it('multiline map constant with trailing comma variations', () => {
            assertIdempotentAllConfigs(
                [
                    'const map<string, i32> A = {',
                    '    "a": 1,',
                    '    "b": 2,',
                    '}',
                    'const map<string, i32> B = {',
                    '    "a": 1,',
                    '    "b": 2',
                    '}'
                ].join('\n'),
                'const-trailing-comma-variations'
            );
        });
    });

    describe('edge cases', () => {
        it('empty input', () => {
            assertIdempotentAllConfigs('', 'empty-input');
        });

        it('only whitespace', () => {
            assertIdempotentAllConfigs('   \n\n  \n', 'whitespace-only');
        });

        it('only comments', () => {
            assertIdempotentAllConfigs(
                '// just a comment\n# another comment\n/* block */\n/** doc */',
                'comments-only'
            );
        });

        it('uuid type', () => {
            assertIdempotentAllConfigs(
                'struct HasUuid {\n    1: uuid requestId\n    2: optional uuid correlationId\n}',
                'uuid-type'
            );
        });

        it('binary and slist types', () => {
            assertIdempotentAllConfigs(
                'struct BlobHolder {\n    1: binary data\n    2: slist legacy\n}',
                'binary-slist-types'
            );
        });

        it('deeply nested default value', () => {
            assertIdempotentAllConfigs(
                'struct D {\n    1: list<list<map<string, i32>>> field = [[{"a": 1}], [{"b": 2}]]\n}',
                'deep-nested-default'
            );
        });

        it('struct with only optional fields', () => {
            assertIdempotentAllConfigs(
                'struct AllOpt {\n    1: optional i32 a\n    2: optional i32 b\n    3: optional i32 c\n}',
                'struct-all-optional'
            );
        });

        it('struct with only required fields', () => {
            assertIdempotentAllConfigs(
                'struct AllReq {\n    1: required i32 a\n    2: required i32 b\n    3: required i32 c\n}',
                'struct-all-required'
            );
        });

        it('escaped strings in annotations', () => {
            assertIdempotentAllConfigs(
                'struct Esc {\n    1: string f (go.tag=\'json:"name"\')\n}',
                'escaped-annotation'
            );
        });

        it('escaped strings in default values', () => {
            assertIdempotentAllConfigs(
                'struct Esc {\n    1: string msg = "hello \\"world\\""\n}',
                'escaped-default'
            );
        });
    });
});
