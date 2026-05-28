const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {ThriftFormatter} = require('../../../out/formatter');
const {ThriftParser} = require('../../../out/ast/parser');

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

const RANGE_KEYS = new Set([
    'range', 'nameRange', 'typeRange', 'valueRange', 'valueTypeRange',
    'aliasTypeRange', 'initializerRange', 'defaultValueRange',
    'returnTypeRange', 'interactionNameRange'
]);

function normalizeType(typeStr) {
    if (typeof typeStr !== 'string') {
        return typeStr;
    }
    let s = typeStr.replace(/\s+/g, ' ').trim();
    let prev = '';
    while (s !== prev) {
        prev = s;
        s = s.replace(/\s*,\s*/g, ',')
            .replace(/<\s+/g, '<')
            .replace(/\s+>/g, '>');
    }
    return s;
}

function compareNodes(original, formatted, path) {
    if (original === formatted) {
        return [];
    }
    if (original === null || original === undefined || formatted === null || formatted === undefined) {
        if (original === null && formatted === undefined || original === undefined && formatted === null) {
            return [];
        }
        return [`${path}: original=${JSON.stringify(original)}, formatted=${JSON.stringify(formatted)}`];
    }
    if (typeof original !== typeof formatted) {
        return [`${path}: type mismatch original=${typeof original}, formatted=${typeof formatted}`];
    }
    if (typeof original !== 'object') {
        if (typeof original === 'string') {
            const normOrig = normalizeType(original);
            const normFmt = normalizeType(formatted);
            if (normOrig === normFmt) {
                return [];
            }
        }
        return [`${path}: ${JSON.stringify(original)} !== ${JSON.stringify(formatted)}`];
    }

    if (Array.isArray(original)) {
        const diffs = [];
        if (original.length > formatted.length) {
            diffs.push(`${path}: formatted lost elements (${original.length} → ${formatted.length})`);
        }
        const len = Math.min(original.length, formatted.length);
        for (let i = 0; i < len; i++) {
            diffs.push(...compareNodes(original[i], formatted[i], `${path}[${i}]`));
        }
        return diffs;
    }

    const diffs = [];
    const allKeys = new Set([...Object.keys(original), ...Object.keys(formatted)]);
    for (const key of allKeys) {
        if (RANGE_KEYS.has(key) || key === 'parent' || key === 'children') {
            continue;
        }
        diffs.push(...compareNodes(original[key], formatted[key], `${path}.${key}`));
    }
    return diffs;
}

function assertAstRoundtrip(input, options, label) {
    const formatter = new ThriftFormatter();
    const formatted = formatter.format(input, options);

    const originalParser = new ThriftParser(input);
    const formattedParser = new ThriftParser(formatted);
    const originalAst = originalParser.parse();
    const formattedAst = formattedParser.parse();

    const diffs = compareNodes(originalAst, formattedAst, 'root');
    const semanticDiffs = diffs.filter(d =>
        !d.includes('.type: "Invalid"') &&
        !d.includes('.type: "Comment"')
    );

    assert.strictEqual(
        semanticDiffs.length, 0,
        `AST roundtrip failed [${label}]:\n${semanticDiffs.slice(0, 10).join('\n')}\n` +
        (semanticDiffs.length > 10 ? `... and ${semanticDiffs.length - 10} more\n` : '') +
        `--- original (first 300 chars) ---\n${input.slice(0, 300)}\n` +
        `--- formatted (first 300 chars) ---\n${formatted.slice(0, 300)}`
    );
}

describe('AST semantic roundtrip', function () {
    this.timeout(60000);

    describe('fixture files', () => {
        const fixtureFiles = [
            'thrift_full_coverage.thrift',
            'example.thrift',
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
            it(`${file}`, () => {
                const content = fs.readFileSync(filePath, 'utf-8');
                assertAstRoundtrip(content, DEFAULT_OPTIONS, file);
            });
        }
    });

    describe('namespace', () => {
        it('preserves namespace scope and value', () => {
            assertAstRoundtrip(
                'namespace cpp my.company\nnamespace java com.mycompany\nnamespace py my_project',
                DEFAULT_OPTIONS, 'namespace'
            );
        });
    });

    describe('include', () => {
        it('preserves include paths', () => {
            assertAstRoundtrip(
                'include "common.thrift"\ninclude "./types/base.thrift"',
                DEFAULT_OPTIONS, 'include'
            );
        });
    });

    describe('typedef', () => {
        it('preserves typedef name and alias type', () => {
            assertAstRoundtrip(
                'typedef i64 UserId\ntypedef map<string, list<i32>> UserScores',
                DEFAULT_OPTIONS, 'typedef'
            );
        });

        it('preserves nested container typedefs', () => {
            assertAstRoundtrip(
                'typedef map<string, list<set<i32>>> ComplexMap\ntypedef list<list<map<string, i32>>> DeepType',
                DEFAULT_OPTIONS, 'nested-typedef'
            );
        });
    });

    describe('const', () => {
        it('preserves scalar const type, name and value', () => {
            assertAstRoundtrip(
                'const i32 MAX = 100\nconst double PI = 3.14159\nconst string NAME = "hello"\nconst bool FLAG = true',
                DEFAULT_OPTIONS, 'scalar-const'
            );
        });

        it('preserves collection const values', () => {
            assertAstRoundtrip(
                'const list<i32> NUMS = [1, 2, 3]\nconst map<string, i32> CODES = {"OK": 200, "ERR": 500}',
                DEFAULT_OPTIONS, 'collection-const'
            );
        });

        it('preserves multiline collection const', () => {
            assertAstRoundtrip(
                'const map<string, i32> CODES = {\n    "OK": 200,\n    "ERR": 500\n}',
                DEFAULT_OPTIONS, 'multiline-const'
            );
        });
    });

    describe('enum', () => {
        it('preserves enum members and initializers', () => {
            assertAstRoundtrip(
                'enum Status {\n    OK = 0,\n    WARN = 1,\n    ERROR = 2,\n    UNKNOWN = -1\n}',
                DEFAULT_OPTIONS, 'enum'
            );
        });

        it('preserves enum without explicit values', () => {
            assertAstRoundtrip(
                'enum Color {\n    RED,\n    GREEN,\n    BLUE\n}',
                DEFAULT_OPTIONS, 'enum-no-values'
            );
        });
    });

    describe('struct', () => {
        it('preserves field id, requiredness, type, name', () => {
            assertAstRoundtrip(
                'struct User {\n    1: required i32 id\n    2: optional string name\n    3: bool active\n}',
                DEFAULT_OPTIONS, 'struct-fields'
            );
        });

        it('preserves default values', () => {
            assertAstRoundtrip(
                'struct Config {\n    1: i32 timeout = 30,\n    2: string host = "localhost",\n    3: bool debug = false\n}',
                DEFAULT_OPTIONS, 'struct-defaults'
            );
        });

        it('preserves nested container field types', () => {
            assertAstRoundtrip(
                'struct Deep {\n    1: list<map<string, set<i32>>> data\n    2: map<string, list<list<i64>>> groups\n}',
                DEFAULT_OPTIONS, 'struct-nested'
            );
        });

        it('preserves collection default values', () => {
            assertAstRoundtrip(
                'struct WithColl {\n    1: list<string> tags = ["a", "b"]\n    2: map<string, i32> scores = {"x": 1}\n}',
                DEFAULT_OPTIONS, 'struct-collection-defaults'
            );
        });
    });

    describe('union', () => {
        it('preserves union fields', () => {
            assertAstRoundtrip(
                'union Value {\n    1: string text,\n    2: i64 number,\n    3: bool flag\n}',
                DEFAULT_OPTIONS, 'union'
            );
        });
    });

    describe('exception', () => {
        it('preserves exception fields and defaults', () => {
            assertAstRoundtrip(
                'exception NotFound {\n    1: required string message\n    2: optional i32 code = 404\n}',
                DEFAULT_OPTIONS, 'exception'
            );
        });
    });

    describe('service', () => {
        it('preserves function signatures', () => {
            assertAstRoundtrip(
                'service Svc {\n    void ping(),\n    string echo(1: string msg)\n}',
                DEFAULT_OPTIONS, 'service-basic'
            );
        });

        it('preserves extends', () => {
            assertAstRoundtrip(
                'service Child extends Base {\n    i32 add(1: i32 a, 2: i32 b)\n}',
                DEFAULT_OPTIONS, 'service-extends'
            );
        });

        it('preserves throws', () => {
            assertAstRoundtrip(
                'service Svc {\n    User get(1: i32 id) throws (1: NotFound err)\n}',
                DEFAULT_OPTIONS, 'service-throws'
            );
        });

        it('preserves oneway', () => {
            assertAstRoundtrip(
                'service Svc {\n    oneway void notify(1: string msg)\n}',
                DEFAULT_OPTIONS, 'service-oneway'
            );
        });

        it('preserves multi-line parameters', () => {
            assertAstRoundtrip(
                [
                    'service Svc {',
                    '    void doStuff(',
                    '        1: required string trace,',
                    '        2: required i32 id',
                    '    )',
                    '}'
                ].join('\n'),
                DEFAULT_OPTIONS, 'service-multiline-params'
            );
        });
    });

    describe('interaction and performs', () => {
        it('preserves interaction functions', () => {
            assertAstRoundtrip(
                'interaction Calc {\n    i32 add(1: i32 a, 2: i32 b)\n    void reset()\n}',
                DEFAULT_OPTIONS, 'interaction'
            );
        });

        it('preserves performs declarations', () => {
            assertAstRoundtrip(
                'service DataSvc {\n    performs Calc calc\n    void ping()\n}',
                DEFAULT_OPTIONS, 'performs'
            );
        });
    });

    describe('trailingComma modes preserve semantics', () => {
        const input = 'struct S {\n    1: i32 a,\n    2: string b\n}\nenum E {\n    X = 1,\n    Y = 2\n}';

        it('trailingComma=add', () => {
            assertAstRoundtrip(input, {...DEFAULT_OPTIONS, trailingComma: 'add'}, 'trailing-add');
        });

        it('trailingComma=remove', () => {
            assertAstRoundtrip(input, {...DEFAULT_OPTIONS, trailingComma: 'remove'}, 'trailing-remove');
        });

        it('trailingComma=preserve', () => {
            assertAstRoundtrip(input, {...DEFAULT_OPTIONS, trailingComma: 'preserve'}, 'trailing-preserve');
        });
    });

    describe('alignment options preserve semantics', () => {
        const input = [
            'struct User {',
            '    1: required i64 id = 1001,',
            '    2: required string name,',
            '    3: optional bool active = true',
            '}'
        ].join('\n');

        it('all alignment on', () => {
            assertAstRoundtrip(input, {
                ...DEFAULT_OPTIONS,
                alignTypes: true, alignFieldNames: true, alignStructDefaults: true,
                alignAnnotations: true, alignComments: true
            }, 'align-all-on');
        });

        it('all alignment off', () => {
            assertAstRoundtrip(input, {
                ...DEFAULT_OPTIONS,
                alignTypes: false, alignFieldNames: false, alignStructDefaults: false,
                alignAnnotations: false, alignComments: false,
                alignEnumNames: false, alignEnumEquals: false, alignEnumValues: false
            }, 'align-all-off');
        });
    });

    describe('dirty inputs preserve semantics', () => {
        it('irregular spacing', () => {
            assertAstRoundtrip(
                'struct Messy{\n1:required   i32    id\n     2:  optional string name\n}',
                DEFAULT_OPTIONS, 'dirty-spacing'
            );
        });

        it('mixed separators', () => {
            assertAstRoundtrip(
                'struct Mix {\n    1: i32 a,\n    2: i32 b;\n    3: i32 c\n}',
                DEFAULT_OPTIONS, 'dirty-mixed-sep'
            );
        });

        it('single-line struct', () => {
            assertAstRoundtrip(
                'struct Tiny { 1: i32 id, 2: string name }',
                DEFAULT_OPTIONS, 'dirty-single-line'
            );
        });

        it('generic spacing normalization', () => {
            assertAstRoundtrip(
                'typedef map< string , list< set< i32 > > > WeirdMap',
                DEFAULT_OPTIONS, 'dirty-generic-spaces'
            );
        });
    });
});
