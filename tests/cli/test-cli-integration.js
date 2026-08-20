/**
 * CLI integration tests: runs the bundled CLI binary directly and validates
 * exit codes, stdout, and stderr for each command.
 */
'use strict';

const assert = require('assert');
const path = require('path');
const {spawnSync} = require('child_process');
const fs = require('fs');
const os = require('os');

const CLI = path.join(__dirname, '../../packages/cli/dist/cli.js');
const TEST_FILES = path.join(__dirname, '../../test-files');
const SAMPLE = path.join(TEST_FILES, 'example.thrift');
const SAMPLE_ENUM = path.join(TEST_FILES, 'example-enum.thrift');
const SAMPLE_LINT_CLEAN = SAMPLE_ENUM;
const SAMPLE_SMALL = path.join(TEST_FILES, 'shared.thrift'); // 196 bytes, safe for multi-file parse

function run(args, options = {}) {
    const result = spawnSync(process.execPath, [CLI, ...args], {
        encoding: 'utf8',
        maxBuffer: 10 * 1024 * 1024,
        env: {...process.env},
        ...options
    });
    return {
        code: result.status,
        stdout: result.stdout || '',
        stderr: result.stderr || ''
    };
}

/** Create a temp file, return its path. Caller is responsible for cleanup. */
function tmpFile(name, content) {
    const p = path.join(os.tmpdir(), name);
    fs.writeFileSync(p, content, 'utf-8');
    return p;
}

describe('CLI integration', () => {
    describe('format command', () => {
        it('--check on valid file exits 0', () => {
            const {code} = run(['format', '--check', SAMPLE]);
            assert.strictEqual(code, 0, 'should exit 0 for already-formatted file');
        });

        it('--stdin formats thrift from stdin', () => {
            const input = 'struct Foo {\n  1:   i32   id\n}\n';
            const {code, stdout} = run(['format', '--stdin'], {input});
            assert.strictEqual(code, 0);
            assert.ok(stdout.includes('struct Foo'), 'formatted output should contain struct');
        });

        it('--check on unformatted file exits non-zero', () => {
            const f = tmpFile('cli-fmt-check.thrift', 'struct  Foo{\n1:  i32   id\n}\n');
            try {
                const {code} = run(['format', '--check', f]);
                assert.notStrictEqual(code, 0, 'unformatted file should fail --check');
            } finally {
                fs.unlinkSync(f);
            }
        });

        it('--write rewrites file in-place', () => {
            const f = tmpFile('cli-fmt-write.thrift', 'struct  Foo{\n1:  i32   id\n}\n');
            try {
                const {code} = run(['format', '--write', f]);
                assert.strictEqual(code, 0);
                const content = fs.readFileSync(f, 'utf-8');
                // Formatter normalizes field alignment (not struct declaration spacing)
                assert.ok(content.includes('1: i32 id'), 'field alignment should be normalized');
                assert.ok(!content.includes('1:  i32   id'), 'extra spaces should be removed');
            } finally {
                fs.unlinkSync(f);
            }
        });

        it('--write and --stdin are mutually exclusive', () => {
            const {code, stderr} = run(['format', '--write', '--stdin'], {input: 'struct Foo {}\n'});
            assert.notStrictEqual(code, 0);
            assert.ok(stderr.includes('--write') || stderr.includes('stdin'), 'should explain conflict');
        });

        it('exits non-zero for non-existent file', () => {
            const {code} = run(['format', '--check', '/nonexistent/file.thrift']);
            assert.notStrictEqual(code, 0);
        });

        it('no files specified exits with usage error', () => {
            const {code} = run(['format']);
            assert.notStrictEqual(code, 0);
        });

        it('--range formats only the selected lines', () => {
            const input = [
                'struct User {',
                '  1: string name',
                '  2: i32   age',
                '}',
                '',
                'enum Color {',
                '    RED = 1',
                '}',
                ''
            ].join('\n');
            const f = tmpFile('cli-fmt-range.thrift', input);
            try {
                // struct 字段在 2~3 行（1-based），enum 在 7 行：只格式化 2:3
                const {code, stdout} = run(['format', '--range', '2:3', f]);
                assert.strictEqual(code, 0);
                const expected = [
                    'struct User {',
                    '    1: string name',
                    '    2: i32    age',
                    '}',
                    '',
                    'enum Color {',
                    '    RED = 1',
                    '}',
                    ''
                ].join('\n');
                assert.strictEqual(stdout, expected, 'only the range should be formatted');
            } finally {
                fs.unlinkSync(f);
            }
        });

        it('--range keeps out-of-range lines untouched', () => {
            const input = [
                'enum Color {',
                '    RED = 1',
                '  BLUE = 2',
                '}',
                ''
            ].join('\n');
            const f = tmpFile('cli-fmt-range-keep.thrift', input);
            try {
                // 只格式化 2 行；3 行（BLUE 缩进不对）必须保持原样
                const {code, stdout} = run(['format', '--range', '2:2', f]);
                assert.strictEqual(code, 0);
                const lines = stdout.split('\n');
                assert.strictEqual(lines[1], '    RED = 1', 'line 2 should be formatted');
                assert.strictEqual(lines[2], '  BLUE = 2', 'line 3 must remain untouched');
            } finally {
                fs.unlinkSync(f);
            }
        });

        it('--range --check reports only when range is unformatted', () => {
            const input = [
                'struct User {',
                '  1: string name',
                '}',
                ''
            ].join('\n');
            const f = tmpFile('cli-fmt-range-check.thrift', input);
            try {
                // range 内（2 行）缩进不正确 → 失败
                const dirty = run(['format', '--check', '--range', '2:2', f]);
                assert.notStrictEqual(dirty.code, 0);
                assert.ok(dirty.stdout.includes(f), 'unformatted file path should be printed');
                // 格式化后再检查同一 range → 通过
                run(['format', '--write', '--range', '2:2', f]);
                const clean = run(['format', '--check', '--range', '2:2', f]);
                assert.strictEqual(clean.code, 0, 'formatted range should pass --check');
            } finally {
                fs.unlinkSync(f);
            }
        });

        it('--range starting on a block declaration line does not indent it', () => {
            const input = [
                'struct User {',
                '  1: string name',
                '}',
                ''
            ].join('\n');
            const f = tmpFile('cli-fmt-range-opener.thrift', input);
            try {
                // 1 行是 struct 声明行：起始上下文不应把该块算入，声明行保持列 0
                const {code, stdout} = run(['format', '--range', '1:2', f]);
                assert.strictEqual(code, 0);
                const lines = stdout.split('\n');
                assert.strictEqual(lines[0], 'struct User {', 'block declaration line must not be indented');
                assert.strictEqual(lines[1], '    1: string name', 'field should use struct indent');
            } finally {
                fs.unlinkSync(f);
            }
        });

        it('--range keeps sibling top-level blocks un-nested and preserves enum semantics', () => {
            const input = [
                'struct SomeStruct {',
                '  1: string name',
                '  2: i32 count',
                '}',
                '',
                'enum ReachReadReaderType {',
                '  Unknown = 0',
                '  Valid = 1',
                '  Invalid = 2',
                '}',
                '',
                'enum ReachReadEvent {',
                '  Unknown = 0',
                '  STARTED = 1',
                '  COMPLETED = 2',
                '}',
                '',
                'struct ReachReadEventData {',
                '  1: ReachReadEvent event',
                '  2: string detail',
                '}',
                ''
            ].join('\n');
            const f = tmpFile('cli-fmt-range-blocks.thrift', input);
            try {
                // 覆盖 enum/struct 块（6~21 行，1-based）。顶层声明不得被嵌套缩进，
                // 各枚举项必须留在各自的 enum 内，不得合并或清空。
                const {code, stdout} = run(['format', '--range', '6:21', f]);
                assert.strictEqual(code, 0);
                const lines = stdout.split('\n');
                assert.strictEqual(lines[5], 'enum ReachReadReaderType {', 'enum must stay at top level');
                assert.strictEqual(lines[6], '    Unknown = 0', 'first enum member indented once');
                assert.strictEqual(lines[7], '    Valid   = 1', 'second enum member');
                assert.strictEqual(lines[8], '    Invalid = 2', 'third enum member');
                assert.strictEqual(lines[11], 'enum ReachReadEvent {', 'second enum must stay at top level');
                assert.strictEqual(lines[12], '    Unknown   = 0', 'second enum member kept in its own enum');
                assert.strictEqual(lines[13], '    STARTED   = 1', 'STARTED stays in ReachReadEvent');
                assert.strictEqual(lines[14], '    COMPLETED = 2', 'COMPLETED stays in ReachReadEvent');
                assert.strictEqual(lines[17], 'struct ReachReadEventData {', 'struct stays at top level');
            } finally {
                fs.unlinkSync(f);
            }
        });

        it('--range does not over-indent service methods', () => {
            const input = [
                'service Calculator {',
                '  i32 add(1: i32 a, 2: i32 b)',
                '  i32 subtract(1: i32 a, 2: i32 b)',
                '}',
                ''
            ].join('\n');
            const f = tmpFile('cli-fmt-range-service.thrift', input);
            try {
                // 只格式化 service 方法行（2~3 行）：不得比整文件格式化多缩进一层
                const {code, stdout} = run(['format', '--range', '2:3', f]);
                assert.strictEqual(code, 0);
                const lines = stdout.split('\n');
                assert.strictEqual(lines[1], '    i32 add(1: i32 a, 2: i32 b)', 'method at service method indent');
                assert.strictEqual(lines[2], '    i32 subtract(1: i32 a, 2: i32 b)', 'method at service method indent');
            } finally {
                fs.unlinkSync(f);
            }
        });

        it('--range beyond EOF is a no-op', () => {
            const f = tmpFile('cli-fmt-range-eof.thrift', 'struct Foo {}\n');
            try {
                const {code, stdout} = run(['format', '--range', '99:100', f]);
                assert.strictEqual(code, 0);
                assert.strictEqual(stdout, 'struct Foo {}\n', 'out-of-range request must not format anything');
                const {code: checkCode} = run(['format', '--check', '--range', '99:100', f]);
                assert.strictEqual(checkCode, 0, 'out-of-range --check must pass');
            } finally {
                fs.unlinkSync(f);
            }
        });

        it('--range formats a field line inside a struct', () => {
            const input = [
                'struct User {',
                '    1: i32  age',
                '}',
                ''
            ].join('\n');
            const f = tmpFile('cli-fmt-range-inner.thrift', input);
            try {
                // 只格式化 2 行：多余空格被规整，缩进由 struct 上下文推导（4 空格）
                const {code, stdout} = run(['format', '--range', '2:2', f]);
                assert.strictEqual(code, 0);
                const lines = stdout.split('\n');
                assert.strictEqual(lines[1], '    1: i32 age', 'field spacing should be normalized in-range');
            } finally {
                fs.unlinkSync(f);
            }
        });

        it('--range rejects start > end', () => {
            const f = tmpFile('cli-fmt-range-invalid.thrift', 'struct Foo {}\n');
            try {
                const {code, stderr} = run(['format', '--range', '5:2', f]);
                assert.notStrictEqual(code, 0);
                assert.ok(stderr.includes('--range'), 'should report the bad option');
            } finally {
                fs.unlinkSync(f);
            }
        });

        it('--range supports --stdin', () => {
            const input = 'struct User {\n  1: string name\n}\n';
            const {code, stdout} = run(['format', '--stdin', '--range', '2:2'], {input});
            assert.strictEqual(code, 0);
            const lines = stdout.split('\n');
            assert.strictEqual(lines[1], '    1: string name', 'field line should be formatted');
        });
    });

    describe('lint command', () => {
        it('exits 0 for a valid thrift file', () => {
            const {code} = run(['lint', SAMPLE_LINT_CLEAN]);
            assert.strictEqual(code, 0, 'valid file should lint clean');
        });

        it('--json outputs JSON array for clean file', () => {
            const {code, stdout} = run(['lint', '--json', SAMPLE_LINT_CLEAN]);
            assert.strictEqual(code, 0);
            const issues = JSON.parse(stdout);
            assert.ok(Array.isArray(issues), 'should output JSON array');
        });

        it('--json outputs issues for file with errors', () => {
            // Unknown type reference triggers a diagnostic
            const f = tmpFile('cli-lint-err.thrift', 'struct Foo { 1: UnknownType999 bar }\n');
            try {
                const {stdout} = run(['lint', '--json', f]);
                const issues = JSON.parse(stdout);
                assert.ok(Array.isArray(issues), 'should output JSON array even with issues');
            } finally {
                fs.unlinkSync(f);
            }
        });

        it('--severity error filters to errors only', () => {
            const {code} = run(['lint', '--severity', 'error', SAMPLE_LINT_CLEAN]);
            assert.strictEqual(code, 0);
        });

        it('--severity warning filters to warnings and errors', () => {
            const {code} = run(['lint', '--severity', 'warning', SAMPLE_LINT_CLEAN]);
            assert.strictEqual(code, 0);
        });

        it('--quiet suppresses stdout output', () => {
            const {code, stdout} = run(['lint', '--quiet', SAMPLE_LINT_CLEAN]);
            assert.strictEqual(code, 0);
            assert.strictEqual(stdout, '', '--quiet should suppress stdout');
        });

        it('multiple files are all linted', () => {
            const {code} = run(['lint', SAMPLE_LINT_CLEAN, SAMPLE_SMALL]);
            assert.strictEqual(code, 0);
        });

        it('exits non-zero for missing file', () => {
            const {code} = run(['lint', '/nonexistent/file.thrift']);
            assert.notStrictEqual(code, 0);
        });

        it('no files specified exits with usage error', () => {
            const {code} = run(['lint']);
            assert.notStrictEqual(code, 0);
        });
    });

    describe('parse command', () => {
        it('--stdin parses and outputs JSON AST', () => {
            const input = 'namespace cpp test\nstruct Bar { 1: string name }\n';
            const {code, stdout} = run(['parse', '--stdin'], {input});
            assert.strictEqual(code, 0);
            const ast = JSON.parse(stdout);
            assert.strictEqual(ast.type, 'Document', 'should return Document node');
            assert.ok(Array.isArray(ast.body), 'should have body array');
        });

        it('parses an actual file', () => {
            // Use a small file to keep JSON output manageable
            const {code, stdout} = run(['parse', SAMPLE_ENUM]);
            assert.strictEqual(code, 0);
            const ast = JSON.parse(stdout);
            assert.strictEqual(ast.type, 'Document');
        });

        it('parses multiple files outputs JSON array format', () => {
            // Avoid JSON.parse on large AST; verify structure via string checks
            const {code, stdout} = run(['parse', SAMPLE_ENUM, SAMPLE_SMALL]);
            assert.strictEqual(code, 0);
            assert.ok(stdout.trim().startsWith('['), 'multiple files should return JSON array');
            assert.ok(stdout.includes('"file"'), 'each entry should have a file field');
            assert.ok(stdout.includes('"ast"'), 'each entry should have an ast field');
        });

        it('exits non-zero for non-existent file', () => {
            const {code} = run(['parse', '/nonexistent/file.thrift']);
            assert.notStrictEqual(code, 0);
        });

        it('no files and no --stdin exits with usage error', () => {
            const {code} = run(['parse']);
            assert.notStrictEqual(code, 0);
        });
    });

    describe('symbols command', () => {
        it('--json outputs symbols for a file', () => {
            const {code, stdout} = run(['symbols', '--json', SAMPLE]);
            assert.strictEqual(code, 0);
            const symbols = JSON.parse(stdout);
            assert.ok(Array.isArray(symbols), 'symbols should be an array');
        });

        it('--flat --json outputs flat list', () => {
            const {code, stdout} = run(['symbols', '--json', '--flat', SAMPLE]);
            assert.strictEqual(code, 0);
            const symbols = JSON.parse(stdout);
            assert.ok(Array.isArray(symbols), 'flat symbols should be an array');
        });

        it('text output without --json', () => {
            const {code, stdout} = run(['symbols', SAMPLE]);
            assert.strictEqual(code, 0);
            assert.ok(stdout.length > 0, 'text output should be non-empty');
        });

        it('multiple files in text mode prints file headers', () => {
            const {code, stdout} = run(['symbols', SAMPLE, SAMPLE_ENUM]);
            assert.strictEqual(code, 0);
            assert.ok(stdout.length > 0, 'should output symbols for both files');
        });

        it('multiple files in --json mode returns array', () => {
            const {code, stdout} = run(['symbols', '--json', SAMPLE, SAMPLE_ENUM]);
            assert.strictEqual(code, 0);
            const results = JSON.parse(stdout);
            assert.ok(Array.isArray(results), 'should return array for multiple files');
            assert.strictEqual(results.length, 2);
        });

        it('missing file exits non-zero', () => {
            const {code} = run(['symbols', '/nonexistent.thrift']);
            assert.notStrictEqual(code, 0);
        });

        it('no files specified exits with usage error', () => {
            const {code} = run(['symbols']);
            assert.notStrictEqual(code, 0);
        });
    });

    describe('directory and glob expansion', () => {
        it('directory input expands to all .thrift files', () => {
            // Use a controlled temp dir with known small files to avoid huge JSON output
            const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-test-'));
            try {
                fs.writeFileSync(path.join(tmpDir, 'a.thrift'), 'struct A { 1: i32 x }\n');
                fs.writeFileSync(path.join(tmpDir, 'b.thrift'), 'struct B { 1: string y }\n');
                const {code, stdout} = run(['symbols', '--json', tmpDir]);
                assert.strictEqual(code, 0);
                const results = JSON.parse(stdout);
                assert.ok(Array.isArray(results), 'directory should expand to multiple files');
                assert.strictEqual(results.length, 2, 'should find exactly 2 .thrift files');
            } finally {
                fs.rmSync(tmpDir, {recursive: true});
            }
        });

        it('non-existent directory path does not crash', () => {
            const {code} = run(['lint', '/nonexistent-dir/']);
            assert.notStrictEqual(code, 0);
        });
    });

    describe('general', () => {
        it('--version prints version', () => {
            const {code, stdout} = run(['--version']);
            assert.strictEqual(code, 0);
            assert.match(stdout.trim(), /\d+\.\d+\.\d+/);
        });

        it('--help prints usage', () => {
            const {code, stdout} = run(['--help']);
            assert.strictEqual(code, 0);
            assert.ok(stdout.includes('format') || stdout.includes('Usage'), 'help should mention commands');
        });

        it('unknown command exits non-zero', () => {
            const {code} = run(['unknowncmd']);
            assert.notStrictEqual(code, 0);
        });
    });
});
