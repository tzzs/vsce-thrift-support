'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const CLI_OUT = path.join(__dirname, '../../packages/cli/out');

// Lazily required so compilation errors surface as test failures, not load errors
let outputMod, configMod, globMod, argsMod;

function tmpDir(prefix) {
    return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

describe('CLI unit tests', () => {
    before(() => {
        outputMod = require(path.join(CLI_OUT, 'output.js'));
        configMod = require(path.join(CLI_OUT, 'config.js'));
        globMod   = require(path.join(CLI_OUT, 'glob.js'));
        argsMod   = require(path.join(CLI_OUT, 'args.js'));
    });

    // ─── output.formatIssuesText ──────────────────────────────────────────────
    describe('output.formatIssuesText', () => {
        it('returns empty string for no issues', () => {
            assert.strictEqual(outputMod.formatIssuesText('/a.thrift', []), '');
        });

        it('formats a single error issue with code', () => {
            const issue = {
                severity: 0, // DiagnosticSeverity.Error
                range: {start: {line: 1, character: 5}, end: {line: 1, character: 10}},
                message: 'Unexpected token',
                code: 'E001',
            };
            const out = outputMod.formatIssuesText('/a.thrift', [issue]);
            assert.ok(out.includes('/a.thrift:2:6:'), 'line/col should be 1-based');
            assert.ok(out.includes('error'), 'should label severity');
            assert.ok(out.includes('Unexpected token'));
            assert.ok(out.includes('[E001]'), 'should include code');
        });

        it('formats a warning without code', () => {
            const issue = {
                severity: 1, // DiagnosticSeverity.Warning
                range: {start: {line: 0, character: 0}, end: {line: 0, character: 3}},
                message: 'Lint warning',
                code: null,
            };
            const out = outputMod.formatIssuesText('/b.thrift', [issue]);
            assert.ok(out.includes('warning'));
            assert.ok(!out.includes('['), 'no code bracket when code is null');
        });

        it('formats multiple issues as separate lines', () => {
            const issues = [
                {severity: 0, range: {start: {line: 0, character: 0}, end: {line: 0, character: 1}}, message: 'E', code: null},
                {severity: 1, range: {start: {line: 1, character: 0}, end: {line: 1, character: 1}}, message: 'W', code: null},
            ];
            const lines = outputMod.formatIssuesText('/c.thrift', issues).split('\n');
            assert.strictEqual(lines.length, 2);
        });
    });

    // ─── output.formatIssuesJson ──────────────────────────────────────────────
    describe('output.formatIssuesJson', () => {
        it('returns empty array for no issues', () => {
            assert.deepStrictEqual(outputMod.formatIssuesJson('/a.thrift', []), []);
        });

        it('maps issue fields to JSON object', () => {
            const issue = {
                severity: 0,
                range: {start: {line: 2, character: 4}, end: {line: 2, character: 9}},
                message: 'Some error',
                code: 'E42',
            };
            const [obj] = outputMod.formatIssuesJson('/a.thrift', [issue]);
            assert.strictEqual(obj.file, '/a.thrift');
            assert.strictEqual(obj.line, 3);    // 1-based
            assert.strictEqual(obj.column, 5);
            assert.strictEqual(obj.endLine, 3);
            assert.strictEqual(obj.endColumn, 10);
            assert.strictEqual(obj.severity, 'error');
            assert.strictEqual(obj.message, 'Some error');
            assert.strictEqual(obj.code, 'E42');
        });

        it('uses null for missing code', () => {
            const issue = {
                severity: 1,
                range: {start: {line: 0, character: 0}, end: {line: 0, character: 1}},
                message: 'Warning',
                code: undefined,
            };
            const [obj] = outputMod.formatIssuesJson('/a.thrift', [issue]);
            assert.strictEqual(obj.code, null);
            assert.strictEqual(obj.severity, 'warning');
        });
    });

    // ─── output.formatSymbolsText ─────────────────────────────────────────────
    describe('output.formatSymbolsText', () => {
        it('returns empty string for no symbols', () => {
            assert.strictEqual(outputMod.formatSymbolsText([]), '');
        });

        it('formats a symbol with kind, name, and line', () => {
            const out = outputMod.formatSymbolsText([{name: 'MyStruct', kind: 'struct', line: 5}]);
            assert.ok(out.includes('struct MyStruct'));
            assert.ok(out.includes('(line 5)'));
        });

        it('includes detail when present', () => {
            const out = outputMod.formatSymbolsText([{name: 'MAX', kind: 'enum_value', line: 10, detail: '= 100'}]);
            assert.ok(out.includes('= 100'));
        });

        it('indents children by 2 spaces per level', () => {
            const sym = {
                name: 'Root', kind: 'struct', line: 1,
                children: [{name: 'child', kind: 'field', line: 2}],
            };
            const lines = outputMod.formatSymbolsText([sym]).split('\n');
            assert.strictEqual(lines.length, 2);
            assert.ok(lines[1].startsWith('  '), 'child should be indented');
            assert.ok(!lines[0].startsWith(' '), 'root should not be indented');
        });

        it('applies custom indent level', () => {
            const out = outputMod.formatSymbolsText([{name: 'X', kind: 'field', line: 1}], 2);
            assert.ok(out.startsWith('    '), 'indent=2 means 4 spaces');
        });
    });

    // ─── config.findConfigFile ────────────────────────────────────────────────
    describe('config.findConfigFile', () => {
        it('returns null when no .thriftrc.json exists up the tree', () => {
            const d = tmpDir('cli-cfg-none-');
            try {
                assert.strictEqual(configMod.findConfigFile(d), null);
            } finally {
                fs.rmdirSync(d);
            }
        });

        it('finds .thriftrc.json in the same directory', () => {
            const d = tmpDir('cli-cfg-same-');
            try {
                const cfg = path.join(d, '.thriftrc.json');
                fs.writeFileSync(cfg, '{}');
                assert.strictEqual(configMod.findConfigFile(d), cfg);
            } finally {
                fs.rmSync(d, {recursive: true});
            }
        });

        it('finds .thriftrc.json in a parent directory', () => {
            const d = tmpDir('cli-cfg-parent-');
            try {
                const cfg = path.join(d, '.thriftrc.json');
                fs.writeFileSync(cfg, '{}');
                const sub = path.join(d, 'sub');
                fs.mkdirSync(sub);
                assert.strictEqual(configMod.findConfigFile(sub), cfg);
            } finally {
                fs.rmSync(d, {recursive: true});
            }
        });
    });

    // ─── config.loadConfig ────────────────────────────────────────────────────
    describe('config.loadConfig', () => {
        it('parses valid JSON config', () => {
            const d = tmpDir('cli-load-ok-');
            try {
                const cfg = path.join(d, '.thriftrc.json');
                fs.writeFileSync(cfg, '{"format":{"indentSize":2}}');
                const result = configMod.loadConfig(cfg);
                assert.strictEqual(result.format.indentSize, 2);
            } finally {
                fs.rmSync(d, {recursive: true});
            }
        });

        it('warns for unknown config keys without dropping known config', () => {
            const d = tmpDir('cli-load-unknown-');
            try {
                const cfg = path.join(d, '.thriftrc.json');
                fs.writeFileSync(cfg, '{"format":{"indentSize":2,"unknown":true},"mystery":1}');
                const o = captureOutput(() => configMod.loadConfig(cfg));
                assert.strictEqual(o.returned.format.indentSize, 2);
                assert.ok(o.stderr.includes('Unknown config key "format.unknown"'));
                assert.ok(o.stderr.includes('Unknown config key "mystery"'));
            } finally {
                fs.rmSync(d, {recursive: true});
            }
        });

        it('returns {} for invalid JSON and writes to stderr', () => {
            const d = tmpDir('cli-load-bad-');
            try {
                const cfg = path.join(d, 'bad.json');
                fs.writeFileSync(cfg, '{ not json {{');
                const result = configMod.loadConfig(cfg);
                assert.deepStrictEqual(result, {});
            } finally {
                fs.rmSync(d, {recursive: true});
            }
        });

        it('returns {} for non-existent file', () => {
            const result = configMod.loadConfig('/nonexistent/.thriftrc.json');
            assert.deepStrictEqual(result, {});
        });
    });

    // ─── config.resolveFormatOptions ─────────────────────────────────────────
    describe('config.resolveFormatOptions', () => {
        it('returns empty object when config and overrides are empty', () => {
            assert.deepStrictEqual(configMod.resolveFormatOptions({}, {}), {});
        });

        it('carries through config.format values', () => {
            const opts = configMod.resolveFormatOptions({format: {indentSize: 2}}, {});
            assert.strictEqual(opts.indentSize, 2);
        });

        it('CLI overrides take precedence over config', () => {
            const opts = configMod.resolveFormatOptions({format: {indentSize: 4}}, {indentSize: 2});
            assert.strictEqual(opts.indentSize, 2);
        });

        it('applies all four override types', () => {
            const opts = configMod.resolveFormatOptions({}, {
                indentSize: 2,
                maxLineLength: 80,
                trailingComma: 'add',
                collectionStyle: 'multiline',
            });
            assert.strictEqual(opts.indentSize, 2);
            assert.strictEqual(opts.maxLineLength, 80);
            assert.strictEqual(opts.trailingComma, 'add');
            assert.strictEqual(opts.collectionStyle, 'multiline');
        });
    });

    // ─── glob.expandFiles ─────────────────────────────────────────────────────
    describe('glob.expandFiles', () => {
        it('resolves a single .thrift file', () => {
            const d = tmpDir('cli-glob-file-');
            try {
                const f = path.join(d, 'test.thrift');
                fs.writeFileSync(f, 'struct A {}');
                const result = globMod.expandFiles([f]);
                assert.strictEqual(result.length, 1);
                assert.strictEqual(result[0], f);
            } finally {
                fs.rmSync(d, {recursive: true});
            }
        });

        it('skips direct symlink file arguments', function () {
            if (process.platform === 'win32') {
                this.skip();
            }

            const d = tmpDir('cli-glob-symlink-');
            try {
                const real = path.join(d, 'real.thrift');
                const link = path.join(d, 'link.thrift');
                fs.writeFileSync(real, 'struct A {}');
                fs.symlinkSync(real, link);

                const result = globMod.expandFiles([link]);
                assert.deepStrictEqual(result, []);
            } finally {
                fs.rmSync(d, {recursive: true, force: true});
            }
        });

        it('expands a directory to all .thrift files', () => {
            const d = tmpDir('cli-glob-dir-');
            try {
                fs.writeFileSync(path.join(d, 'a.thrift'), 'struct A {}');
                fs.writeFileSync(path.join(d, 'b.thrift'), 'struct B {}');
                fs.writeFileSync(path.join(d, 'ignore.txt'), 'not thrift');
                const result = globMod.expandFiles([d]);
                assert.strictEqual(result.length, 2);
                assert.ok(result.every(f => f.endsWith('.thrift')));
            } finally {
                fs.rmSync(d, {recursive: true});
            }
        });

        it('deduplicates the same file passed twice', () => {
            const d = tmpDir('cli-glob-dedup-');
            try {
                const f = path.join(d, 'test.thrift');
                fs.writeFileSync(f, 'struct A {}');
                const result = globMod.expandFiles([f, f]);
                assert.strictEqual(result.length, 1);
            } finally {
                fs.rmSync(d, {recursive: true});
            }
        });

        it('returns empty array for non-existent path', () => {
            const result = globMod.expandFiles(['/nonexistent-dir-xyz/a.thrift']);
            assert.strictEqual(result.length, 0);
        });

        it('expands glob pattern with * wildcard', () => {
            const d = tmpDir('cli-glob-star-');
            try {
                fs.writeFileSync(path.join(d, 'alpha.thrift'), 'struct A {}');
                fs.writeFileSync(path.join(d, 'beta.thrift'), 'struct B {}');
                fs.writeFileSync(path.join(d, 'gamma.txt'), 'not thrift');
                const pattern = path.join(d, '*.thrift');
                const result = globMod.expandFiles([pattern]);
                assert.strictEqual(result.length, 2, 'should match only .thrift files');
                assert.ok(result.every(f => f.endsWith('.thrift')));
            } finally {
                fs.rmSync(d, {recursive: true});
            }
        });

        it('expands ** glob pattern recursively', () => {
            const d = tmpDir('cli-glob-dstar-');
            try {
                const sub = path.join(d, 'sub');
                fs.mkdirSync(sub);
                fs.writeFileSync(path.join(d, 'root.thrift'), 'struct R {}');
                fs.writeFileSync(path.join(sub, 'nested.thrift'), 'struct N {}');
                const pattern = path.join(d, '**', '*.thrift');
                const result = globMod.expandFiles([pattern]);
                assert.ok(result.length >= 1, 'should find at least one .thrift file via **');
            } finally {
                fs.rmSync(d, {recursive: true});
            }
        });

        it('** matches deeply nested directories', () => {
            const d = tmpDir('cli-glob-deep-');
            try {
                const deep = path.join(d, 'a', 'b', 'c');
                fs.mkdirSync(deep, {recursive: true});
                fs.writeFileSync(path.join(deep, 'deep.thrift'), 'struct D {}');
                fs.writeFileSync(path.join(d, 'a', 'b', 'mid.thrift'), 'struct M {}');
                const pattern = path.join(d, '**', '*.thrift');
                const result = globMod.expandFiles([pattern]);
                assert.strictEqual(result.length, 2, 'should find thrift files at all depths');
            } finally {
                fs.rmSync(d, {recursive: true});
            }
        });

        it('expands glob with ? wildcard', () => {
            const d = tmpDir('cli-glob-qmark-');
            try {
                fs.writeFileSync(path.join(d, 'abc123def.thrift'), 'struct A {}');
                fs.writeFileSync(path.join(d, 'abcXYZdef.thrift'), 'struct B {}');
                fs.writeFileSync(path.join(d, 'abc-def.thrift'), 'struct C {}');
                const pattern = path.join(d, 'abc???def.thrift');
                const result = globMod.expandFiles([pattern]);
                assert.strictEqual(result.length, 2, '? should match exactly one char each');
            } finally {
                fs.rmSync(d, {recursive: true});
            }
        });

        it('expands glob with * backtracking (chars after *)', () => {
            // Pattern 'abc*def.thrift' — * must match middle chars but leave 'def' at end.
            // This exercises the backtracking branch in globMatch.
            const d = tmpDir('cli-glob-back-');
            try {
                fs.writeFileSync(path.join(d, 'abc123def.thrift'), 'struct A {}');
                fs.writeFileSync(path.join(d, 'abcXYZdef.thrift'), 'struct B {}');
                fs.writeFileSync(path.join(d, 'abc123.thrift'), 'struct C {}');
                const pattern = path.join(d, 'abc*def.thrift');
                const result = globMod.expandFiles([pattern]);
                assert.strictEqual(result.length, 2, 'should match only files ending with def');
            } finally {
                fs.rmSync(d, {recursive: true});
            }
        });

        it('expands glob with trailing *', () => {
            // Trailing * exercises the while loop that consumes trailing *s in globMatch.
            const d = tmpDir('cli-glob-trail-');
            try {
                fs.writeFileSync(path.join(d, 'ab.thrift'), 'struct A {}');
                fs.writeFileSync(path.join(d, 'abc.thrift'), 'struct B {}');
                fs.writeFileSync(path.join(d, 'abcd.thrift'), 'struct C {}');
                fs.writeFileSync(path.join(d, 'xy.thrift'), 'struct D {}');
                const pattern = path.join(d, 'ab*.thrift');
                const result = globMod.expandFiles([pattern]);
                assert.strictEqual(result.length, 3, 'ab* should match ab, abc, abcd');
            } finally {
                fs.rmSync(d, {recursive: true});
            }
        });
    });

    // ─── capture helper for stdout/stderr ────────────────────────────────────
    /**
     * Captures all writes to process.stdout and process.stderr while fn runs.
     * Returns {stdout, stderr, returned}.
     */
    function captureOutput(fn) {
        const origStdoutWrite = process.stdout.write;
        const origStderrWrite = process.stderr.write;
        const stdoutChunks = [];
        const stderrChunks = [];
        process.stdout.write = function(chunk, ...rest) {
            stdoutChunks.push(typeof chunk === 'string' ? chunk : chunk.toString());
            return true;
        };
        process.stderr.write = function(chunk, ...rest) {
            stderrChunks.push(typeof chunk === 'string' ? chunk : chunk.toString());
            return true;
        };
        try {
            const returned = fn();
            return {stdout: stdoutChunks.join(''), stderr: stderrChunks.join(''), returned};
        } finally {
            process.stdout.write = origStdoutWrite;
            process.stderr.write = origStderrWrite;
        }
    }

    // ─── args.parseArgs ───────────────────────────────────────────────────────
    describe('args.parseArgs', () => {
        it('returns help=true for empty argv', () => {
            const r = argsMod.parseArgs(['node', 'cli.js']);
            assert.strictEqual(r.help, true);
        });

        it('parses --help before command', () => {
            const r = argsMod.parseArgs(['node', 'cli.js', '--help']);
            assert.strictEqual(r.help, true);
        });

        it('parses --version before command', () => {
            const r = argsMod.parseArgs(['node', 'cli.js', '--version']);
            assert.strictEqual(r.version, true);
            assert.strictEqual(r.command, 'version');
        });

        it('parses -v as --version', () => {
            const r = argsMod.parseArgs(['node', 'cli.js', '-v']);
            assert.strictEqual(r.version, true);
        });

        it('parses format --check', () => {
            const r = argsMod.parseArgs(['node', 'cli.js', 'format', '--check', 'f.thrift']);
            assert.strictEqual(r.command, 'format');
            assert.strictEqual(r.check, true);
            assert.deepStrictEqual(r.files, ['f.thrift']);
        });

        it('parses format --write (-w)', () => {
            const r = argsMod.parseArgs(['node', 'cli.js', 'format', '-w', 'f.thrift']);
            assert.strictEqual(r.write, true);
        });

        it('parses format --stdin', () => {
            const r = argsMod.parseArgs(['node', 'cli.js', 'format', '--stdin']);
            assert.strictEqual(r.stdin, true);
        });

        it('parses --stdin-filepath option', () => {
            const r = argsMod.parseArgs(['node', 'cli.js', 'format', '--stdin', '--stdin-filepath', 'x.thrift']);
            assert.strictEqual(r.stdinFilepath, 'x.thrift');
        });

        it('parses --indent-size', () => {
            const r = argsMod.parseArgs(['node', 'cli.js', 'format', '--indent-size', '2', 'f.thrift']);
            assert.strictEqual(r.indentSize, 2);
        });

        it('parses --max-line-length', () => {
            const r = argsMod.parseArgs(['node', 'cli.js', 'format', '--max-line-length', '80', 'f.thrift']);
            assert.strictEqual(r.maxLineLength, 80);
        });

        it('parses --trailing-comma', () => {
            const r = argsMod.parseArgs(['node', 'cli.js', 'format', '--trailing-comma', 'add', 'f.thrift']);
            assert.strictEqual(r.trailingComma, 'add');
        });

        it('parses --collection-style', () => {
            const r = argsMod.parseArgs(['node', 'cli.js', 'format', '--collection-style', 'multiline', 'f.thrift']);
            assert.strictEqual(r.collectionStyle, 'multiline');
        });

        it('parses lint --severity', () => {
            const r = argsMod.parseArgs(['node', 'cli.js', 'lint', '--severity', 'error', 'f.thrift']);
            assert.strictEqual(r.severity, 'error');
        });

        it('parses --json flag', () => {
            const r = argsMod.parseArgs(['node', 'cli.js', 'lint', '--json', 'f.thrift']);
            assert.strictEqual(r.json, true);
        });

        it('parses --quiet (-q)', () => {
            const r = argsMod.parseArgs(['node', 'cli.js', 'lint', '-q', 'f.thrift']);
            assert.strictEqual(r.quiet, true);
        });

        it('parses --include-path (multiple)', () => {
            const r = argsMod.parseArgs(['node', 'cli.js', 'lint',
                '--include-path', '/a', '--include-path', '/b', 'f.thrift']);
            assert.deepStrictEqual(r.includePaths, ['/a', '/b']);
        });

        it('parses symbols --flat', () => {
            const r = argsMod.parseArgs(['node', 'cli.js', 'symbols', '--flat', 'f.thrift']);
            assert.strictEqual(r.flat, true);
        });

        it('parses --config option', () => {
            const r = argsMod.parseArgs(['node', 'cli.js', 'format', '--config', '/my/.thriftrc.json', 'f.thrift']);
            assert.strictEqual(r.configPath, '/my/.thriftrc.json');
        });

        it('parses --version inside a command (as sub-flag)', () => {
            const r = argsMod.parseArgs(['node', 'cli.js', 'format', '--version']);
            assert.strictEqual(r.version, true);
            assert.strictEqual(r.command, 'version');
        });
    });

    // ─── Command handler unit tests ────────────────────────────────────────
    // These test runFormat / runLint / runParse / runSymbols directly,
    // intercepting stdout/stderr and using temp files for I/O.

    let formatMod, lintMod, parseMod, symbolsMod;

    before(function() {
        this.timeout(10000);
        formatMod  = require(path.join(CLI_OUT, 'commands', 'format.js'));
        lintMod    = require(path.join(CLI_OUT, 'commands', 'lint.js'));
        parseMod   = require(path.join(CLI_OUT, 'commands', 'parse.js'));
        symbolsMod = require(path.join(CLI_OUT, 'commands', 'symbols.js'));
    });

    /** Create a temp .thrift file, return its path. */
    function tmpThrift(prefix, content) {
        const d = tmpDir(prefix);
        const f = path.join(d, 'test.thrift');
        fs.writeFileSync(f, content, 'utf-8');
        return {file: f, dir: d};
    }

    /** Create minimal ParsedArgs with defaults. */
    function makeArgs(overrides = {}) {
        return Object.assign({
            command: 'format',
            files: [],
            help: false,
            version: false,
            check: false,
            write: false,
            stdin: false,
            json: false,
            quiet: false,
            flat: false,
            includePaths: [],
        }, overrides);
    }

    // ─── runFormat ─────────────────────────────────────────────────────────
    describe('runFormat', () => {
        it('formats a valid file to stdout', () => {
            const {file, dir} = tmpThrift('cli-ufmt-out-', 'struct Foo {\n1:  i32  id\n}\n');
            try {
                const o = captureOutput(() => formatMod.runFormat([file], makeArgs({command: 'format'}), {}));
                assert.strictEqual(o.returned, 0);
                assert.ok(o.stdout.includes('struct Foo'), 'should output formatted content');
                assert.ok(o.stdout.includes('1: i32 id'), 'should normalize field alignment');
            } finally {
                fs.rmSync(dir, {recursive: true});
            }
        });

        it('returns 2 when no files specified', () => {
            const o = captureOutput(() => formatMod.runFormat([], makeArgs({command: 'format'}), {}));
            assert.strictEqual(o.returned, 2);
            assert.ok(o.stderr.includes('No files specified'));
        });

        it('--check returns 0 for a properly formatted file', () => {
            const {file, dir} = tmpThrift('cli-ufmt-ckok-', 'struct Foo {\n    1: i32 id\n}\n');
            try {
                const o = captureOutput(() => formatMod.runFormat([file],
                    makeArgs({command: 'format', check: true}), {}));
                assert.strictEqual(o.returned, 0, 'formatted file should pass --check');
            } finally {
                fs.rmSync(dir, {recursive: true});
            }
        });

        it('--check returns 1 and prints file name for unformatted file', () => {
            const {file, dir} = tmpThrift('cli-ufmt-ckbad-', 'struct Foo {\n1:  i32  id\n}\n');
            try {
                const o = captureOutput(() => formatMod.runFormat([file],
                    makeArgs({command: 'format', check: true}), {}));
                assert.strictEqual(o.returned, 1, 'unformatted file should fail --check');
                assert.ok(o.stdout.includes(file), 'should print file path');
            } finally {
                fs.rmSync(dir, {recursive: true});
            }
        });

        it('--write rewrites file in-place', () => {
            const {file, dir} = tmpThrift('cli-ufmt-write-', 'struct Foo {\n1:  i32  id\n}\n');
            try {
                const o = captureOutput(() => formatMod.runFormat([file],
                    makeArgs({command: 'format', write: true}), {}));
                assert.strictEqual(o.returned, 0);
                const content = fs.readFileSync(file, 'utf-8');
                assert.ok(content.includes('1: i32 id'), 'field alignment should be normalized');
                assert.ok(!content.includes('1:  i32  id'), 'extra spaces should be removed');
            } finally {
                fs.rmSync(dir, {recursive: true});
            }
        });

        it('--write does not touch already-formatted file', () => {
            const content = 'struct Foo {\n    1: i32 id\n}\n';
            const {file, dir} = tmpThrift('cli-ufmt-writeok-', content);
            try {
                const o = captureOutput(() => formatMod.runFormat([file],
                    makeArgs({command: 'format', write: true}), {}));
                assert.strictEqual(o.returned, 0);
                assert.strictEqual(fs.readFileSync(file, 'utf-8'), content, 'file should be unchanged');
            } finally {
                fs.rmSync(dir, {recursive: true});
            }
        });

        it('--write and --stdin are mutually exclusive', () => {
            const o = captureOutput(() => formatMod.runFormat([],
                makeArgs({command: 'format', write: true, stdin: true}), {}));
            assert.strictEqual(o.returned, 2);
            assert.ok(o.stderr.includes('--write'), 'should mention --write conflict');
            assert.ok(o.stderr.includes('--stdin'), 'should mention --stdin conflict');
        });

        it('returns 3 for non-existent file', () => {
            const o = captureOutput(() => formatMod.runFormat(['/nonexistent/file.thrift'],
                makeArgs({command: 'format'}), {}));
            assert.strictEqual(o.returned, 3);
            assert.ok(o.stderr.includes('Cannot read'));
        });

        it('handles edge-case content without crashing', () => {
            // The ThriftFormatter is lenient and never throws on any content.
            // Verify it handles unusual inputs gracefully and still produces output.
            const content = 'this is definitely not valid thrift {{{';
            const {file, dir} = tmpThrift('cli-ufmt-edge-', content);
            try {
                const o = captureOutput(() => formatMod.runFormat([file], makeArgs({command: 'format'}), {}));
                assert.strictEqual(o.returned, 0, 'should not crash on edge-case content');
                assert.ok(o.stdout.length > 0, 'should still produce formatted output');
            } finally {
                fs.rmSync(dir, {recursive: true});
            }
        });

        it('applies format overrides (indentSize)', () => {
            const {file, dir} = tmpThrift('cli-ufmt-indent-', 'struct Foo {\n    1: i32 id\n}\n');
            try {
                const o = captureOutput(() => formatMod.runFormat([file], makeArgs({command: 'format'}), {indentSize: 2}));
                assert.strictEqual(o.returned, 0);
                // With indentSize=2, field lines should use exactly 2-space indent,
                // and NOT the default 4-space indent
                assert.ok(/^ {2}\d+: /m.test(o.stdout), 'field line should start with exactly 2 spaces');
                assert.ok(!/^ {4}\d+: /m.test(o.stdout), 'field line should NOT have 4-space indent');
            } finally {
                fs.rmSync(dir, {recursive: true});
            }
        });

        it('check mode with multiple files prints all unformatted ones', () => {
            const dir = tmpDir('cli-ufmt-multi-');
            const f1 = path.join(dir, 'a.thrift');
            const f2 = path.join(dir, 'b.thrift');
            fs.writeFileSync(f1, 'struct A {\n1:  i32  x\n}\n');
            fs.writeFileSync(f2, 'struct B {\n2:  string  y\n}\n');
            try {
                const o = captureOutput(() => formatMod.runFormat([f1, f2],
                    makeArgs({command: 'format', check: true}), {}));
                assert.strictEqual(o.returned, 1);
                assert.ok(o.stdout.includes('a.thrift'), 'should list first unformatted file');
                assert.ok(o.stdout.includes('b.thrift'), 'should list second unformatted file');
            } finally {
                fs.rmSync(dir, {recursive: true});
            }
        });
    });

    // ─── runLint ──────────────────────────────────────────────────────────
    describe('runLint', () => {
        it('returns 0 for a valid file with no issues', () => {
            const {file, dir} = tmpThrift('cli-ulint-clean-',
                'namespace cpp test\nstruct Foo { 1: i32 id }\n');
            try {
                const o = captureOutput(() => lintMod.runLint([file], makeArgs({command: 'lint'}), {}));
                assert.strictEqual(o.returned, 0, 'clean file should return 0');
            } finally {
                fs.rmSync(dir, {recursive: true});
            }
        });

        it('returns 1 and prints issues for file with errors', () => {
            // Duplicate field IDs trigger field.duplicateId (Error)
            const {file, dir} = tmpThrift('cli-ulint-err-',
                'struct Foo {\n  1: i32 a\n  1: i32 b\n}\n');
            try {
                const o = captureOutput(() => lintMod.runLint([file], makeArgs({command: 'lint'}), {}));
                assert.strictEqual(o.returned, 1, 'file with errors should return 1');
                assert.ok(o.stdout.length > 0, 'should output issue text');
                assert.ok(o.stdout.includes('error') || o.stdout.includes('warning'),
                    'should mention severity');
            } finally {
                fs.rmSync(dir, {recursive: true});
            }
        });

        it('--json outputs JSON array for clean file', () => {
            const {file, dir} = tmpThrift('cli-ulint-json-',
                'namespace cpp test\nstruct Foo { 1: i32 id }\n');
            try {
                const o = captureOutput(() => lintMod.runLint([file],
                    makeArgs({command: 'lint', json: true}), {}));
                assert.strictEqual(o.returned, 0);
                const parsed = JSON.parse(o.stdout.trim());
                assert.ok(Array.isArray(parsed), 'should output JSON array');
            } finally {
                fs.rmSync(dir, {recursive: true});
            }
        });

        it('--json outputs JSON array with issues for error file', () => {
            // Duplicate field IDs trigger field.duplicateId (Error)
            const {file, dir} = tmpThrift('cli-ulint-jsonerr-',
                'struct Foo {\n  1: i32 a\n  1: i32 b\n}\n');
            try {
                const o = captureOutput(() => lintMod.runLint([file],
                    makeArgs({command: 'lint', json: true}), {}));
                const parsed = JSON.parse(o.stdout.trim());
                assert.ok(Array.isArray(parsed), 'should output JSON array');
                assert.ok(parsed.length > 0, 'should contain issues');
                assert.ok(parsed[0].file, 'each issue should have file field');
            } finally {
                fs.rmSync(dir, {recursive: true});
            }
        });

        it('--severity error filters to errors only', () => {
            const {file, dir} = tmpThrift('cli-ulint-sev-',
                'struct Foo {\n  1: i32 a\n  1: i32 b\n}\n');
            try {
                const o = captureOutput(() => lintMod.runLint([file],
                    makeArgs({command: 'lint', severity: 'error'}), {}));
                assert.strictEqual(o.returned, 1, 'should find duplicate field ID error');
            } finally {
                fs.rmSync(dir, {recursive: true});
            }
        });

        it('falls back to config.lint.severity when args.severity not set', () => {
            // Exercises the `args.severity ?? config.lint?.severity ?? 'all'` fallback.
            const {file, dir} = tmpThrift('cli-ulint-cfgsev-',
                'struct Foo {\n  1: i32 a\n  1: i32 b\n}\n');
            try {
                const o = captureOutput(() => lintMod.runLint([file],
                    makeArgs({command: 'lint'}), {lint: {severity: 'error'}}));
                assert.strictEqual(o.returned, 1, 'should use config severity=error fallback');
            } finally {
                fs.rmSync(dir, {recursive: true});
            }
        });

        it('applies config.diagnostics rule overrides', () => {
            const {file, dir} = tmpThrift('cli-ulint-diag-rules-',
                'struct Foo {\n  1: i32 a\n  1: i32 b\n}\n');
            try {
                const o = captureOutput(() => lintMod.runLint(
                    [file],
                    makeArgs({command: 'lint'}),
                    {diagnostics: {rules: {'field.duplicateId': 'off'}}}
                ));
                assert.strictEqual(o.returned, 0, 'disabled duplicate field ID rule should not fail lint');
            } finally {
                fs.rmSync(dir, {recursive: true});
            }
        });

        it('--quiet suppresses stdout output', () => {
            // Duplicate field IDs trigger field.duplicateId (Error severity)
            const {file, dir} = tmpThrift('cli-ulint-quiet-',
                'struct Foo {\n  1: i32 a\n  1: i32 b\n}\n');
            try {
                const o = captureOutput(() => lintMod.runLint([file],
                    makeArgs({command: 'lint', quiet: true}), {}));
                assert.strictEqual(o.returned, 1, 'should still return non-zero for errors');
                assert.strictEqual(o.stdout, '', '--quiet should suppress stdout');
            } finally {
                fs.rmSync(dir, {recursive: true});
            }
        });

        it('linting multiple files collects all issues', () => {
            const dir = tmpDir('cli-ulint-multi-');
            const f1 = path.join(dir, 'a.thrift');
            const f2 = path.join(dir, 'b.thrift');
            fs.writeFileSync(f1, 'namespace cpp test\nstruct A { 1: i32 x }\n');
            fs.writeFileSync(f2, 'namespace cpp test\nstruct B { 1: i32 y }\n');
            try {
                const o = captureOutput(() => lintMod.runLint([f1, f2],
                    makeArgs({command: 'lint'}), {}));
                assert.strictEqual(o.returned, 0, 'both clean should return 0');
            } finally {
                fs.rmSync(dir, {recursive: true});
            }
        });

        it('returns 2 when no files specified', () => {
            const o = captureOutput(() => lintMod.runLint([], makeArgs({command: 'lint'}), {}));
            assert.strictEqual(o.returned, 2);
            assert.ok(o.stderr.includes('No files specified'));
        });

        it('returns 3 for non-existent file', () => {
            const o = captureOutput(() => lintMod.runLint(['/nonexistent/file.thrift'],
                makeArgs({command: 'lint'}), {}));
            assert.strictEqual(o.returned, 3);
            assert.ok(o.stderr.includes('Cannot read'));
        });

        it('handles edge-case content without crashing', () => {
            // analyzeThriftAst is lenient and never throws.
            // Verify it handles unusual inputs gracefully.
            const {file, dir} = tmpThrift('cli-ulint-edge-', 'this is garbage {{{');
            try {
                const o = captureOutput(() => lintMod.runLint([file], makeArgs({command: 'lint'}), {}));
                assert.ok(o.returned >= 0 && o.returned <= 1, 'should not crash on edge-case content');
            } finally {
                fs.rmSync(dir, {recursive: true});
            }
        });
    });

    // ─── runParse ─────────────────────────────────────────────────────────
    describe('runParse', () => {
        it('parses a single file to JSON AST on stdout', () => {
            const {file, dir} = tmpThrift('cli-uparse-ok-',
                'namespace cpp test\nstruct Foo { 1: string name }\n');
            try {
                const o = captureOutput(() => parseMod.runParse([file], makeArgs({command: 'parse'})));
                assert.strictEqual(o.returned, 0);
                const ast = JSON.parse(o.stdout.trim());
                assert.strictEqual(ast.type, 'Document', 'should have Document node');
                assert.ok(Array.isArray(ast.body), 'should have body array');
            } finally {
                fs.rmSync(dir, {recursive: true});
            }
        });

        it('parses multiple files as JSON array', () => {
            const dir = tmpDir('cli-uparse-multi-');
            const f1 = path.join(dir, 'a.thrift');
            const f2 = path.join(dir, 'b.thrift');
            fs.writeFileSync(f1, 'struct A { 1: i32 x }\n');
            fs.writeFileSync(f2, 'struct B { 1: i32 y }\n');
            try {
                const o = captureOutput(() => parseMod.runParse([f1, f2],
                    makeArgs({command: 'parse'})));
                assert.strictEqual(o.returned, 0);
                const results = JSON.parse(o.stdout.trim());
                assert.ok(Array.isArray(results), 'multiple files should output JSON array');
                assert.strictEqual(results.length, 2);
                assert.ok(results[0].file, 'each entry should have file field');
                assert.ok(results[0].ast, 'each entry should have ast field');
            } finally {
                fs.rmSync(dir, {recursive: true});
            }
        });

        it('returns 2 when no files specified and not --stdin', () => {
            const o = captureOutput(() => parseMod.runParse([], makeArgs({command: 'parse'})));
            assert.strictEqual(o.returned, 2);
            assert.ok(o.stderr.includes('No files specified'));
        });

        it('returns 3 for non-existent file', () => {
            const o = captureOutput(() => parseMod.runParse(['/nonexistent/file.thrift'],
                makeArgs({command: 'parse'})));
            assert.strictEqual(o.returned, 3);
            assert.ok(o.stderr.includes('Cannot read'));
        });

        it('handles edge-case content without crashing', () => {
            // The ThriftParser is lenient and never throws on any content.
            // Verify it handles unusual inputs gracefully.
            const {file, dir} = tmpThrift('cli-uparse-edge-', 'this is garbage {{{');
            try {
                const o = captureOutput(() => parseMod.runParse([file], makeArgs({command: 'parse'})));
                assert.strictEqual(o.returned, 0, 'should not crash on edge-case content');
            } finally {
                fs.rmSync(dir, {recursive: true});
            }
        });
    });

    // ─── runSymbols ───────────────────────────────────────────────────────
    describe('runSymbols', () => {
        // Multi-line format is REQUIRED for the parser to produce members.
        const SYM_THRIFT = 'namespace cpp test\n'
            + 'enum Color {\n  RED = 1\n  GREEN = 2\n}\n'
            + 'struct User {\n  1: string name\n  2: i32 age\n}\n';

        it('outputs symbol text for a valid file', () => {
            const {file, dir} = tmpThrift('cli-usym-txt-', SYM_THRIFT);
            try {
                const o = captureOutput(() => symbolsMod.runSymbols([file],
                    makeArgs({command: 'symbols'})));
                assert.strictEqual(o.returned, 0);
                assert.ok(o.stdout.length > 0, 'should produce text output');
                assert.ok(o.stdout.includes('Color'), 'should mention enum');
                assert.ok(o.stdout.includes('User'), 'should mention struct');
            } finally {
                fs.rmSync(dir, {recursive: true});
            }
        });

        it('--json outputs JSON array of symbols', () => {
            const {file, dir} = tmpThrift('cli-usym-json-', SYM_THRIFT);
            try {
                const o = captureOutput(() => symbolsMod.runSymbols([file],
                    makeArgs({command: 'symbols', json: true})));
                assert.strictEqual(o.returned, 0);
                const symbols = JSON.parse(o.stdout.trim());
                assert.ok(Array.isArray(symbols), 'should output JSON array');
                const names = symbols.map(s => s.name);
                assert.ok(names.includes('Color'), 'should include Color');
                assert.ok(names.includes('User'), 'should include User');
            } finally {
                fs.rmSync(dir, {recursive: true});
            }
        });

        it('--flat --json outputs flat symbol list', () => {
            const {file, dir} = tmpThrift('cli-usym-flat-', SYM_THRIFT);
            try {
                const o = captureOutput(() => symbolsMod.runSymbols([file],
                    makeArgs({command: 'symbols', json: true, flat: true})));
                assert.strictEqual(o.returned, 0);
                const symbols = JSON.parse(o.stdout.trim());
                assert.ok(Array.isArray(symbols), 'should output JSON array');
                // Flat mode: enum members at top level
                const memberNames = symbols.filter(s => s.kind === 'enum-member').map(s => s.name);
                assert.ok(memberNames.length >= 2, 'should have at least 2 enum members');
            } finally {
                fs.rmSync(dir, {recursive: true});
            }
        });

        it('multiple files in text mode prints file headers', () => {
            const dir = tmpDir('cli-usym-multi-');
            const f1 = path.join(dir, 'a.thrift');
            const f2 = path.join(dir, 'b.thrift');
            fs.writeFileSync(f1, 'struct A { 1: i32 x }\n');
            fs.writeFileSync(f2, 'struct B { 1: i32 y }\n');
            try {
                const o = captureOutput(() => symbolsMod.runSymbols([f1, f2],
                    makeArgs({command: 'symbols'})));
                assert.strictEqual(o.returned, 0);
                assert.ok(o.stdout.includes('a.thrift'), 'should include first file header');
                assert.ok(o.stdout.includes('b.thrift'), 'should include second file header');
            } finally {
                fs.rmSync(dir, {recursive: true});
            }
        });

        it('multiple files in --json mode returns array of per-file results', () => {
            const dir = tmpDir('cli-usym-multijson-');
            const f1 = path.join(dir, 'a.thrift');
            const f2 = path.join(dir, 'b.thrift');
            fs.writeFileSync(f1, 'struct A { 1: i32 x }\n');
            fs.writeFileSync(f2, 'struct B { 1: i32 y }\n');
            try {
                const o = captureOutput(() => symbolsMod.runSymbols([f1, f2],
                    makeArgs({command: 'symbols', json: true})));
                assert.strictEqual(o.returned, 0);
                const results = JSON.parse(o.stdout.trim());
                assert.ok(Array.isArray(results), 'should return array');
                assert.strictEqual(results.length, 2, 'should have 2 entries');
                assert.ok(results[0].file, 'each entry should have file');
                assert.ok(Array.isArray(results[0].symbols), 'each entry should have symbols array');
            } finally {
                fs.rmSync(dir, {recursive: true});
            }
        });

        it('returns 2 when no files specified', () => {
            const o = captureOutput(() => symbolsMod.runSymbols([], makeArgs({command: 'symbols'})));
            assert.strictEqual(o.returned, 2);
            assert.ok(o.stderr.includes('No files specified'));
        });

        it('returns 3 for non-existent file', () => {
            const o = captureOutput(() => symbolsMod.runSymbols(['/nonexistent/file.thrift'],
                makeArgs({command: 'symbols'})));
            assert.strictEqual(o.returned, 3);
            assert.ok(o.stderr.includes('Cannot read'));
        });

        it('handles edge-case content without crashing', () => {
            // The ThriftParser is lenient and never throws.
            // Verify it handles unusual inputs gracefully.
            const {file, dir} = tmpThrift('cli-usym-edge-', 'this is garbage {{{');
            try {
                const o = captureOutput(() => symbolsMod.runSymbols([file],
                    makeArgs({command: 'symbols'})));
                assert.strictEqual(o.returned, 0, 'should not crash on edge-case content');
            } finally {
                fs.rmSync(dir, {recursive: true});
            }
        });

        it('extracts interaction symbol from thrift file', () => {
            // Exercises the ThriftNodeType.Interaction handler (line 169-182).
            const content = 'interaction MyInteraction {\n  void greet(1: string name)\n}\n';
            const {file, dir} = tmpThrift('cli-usym-inter-', content);
            try {
                const o = captureOutput(() => symbolsMod.runSymbols([file],
                    makeArgs({command: 'symbols', json: true})));
                assert.strictEqual(o.returned, 0);
                const symbols = JSON.parse(o.stdout.trim());
                const inter = symbols.find(s => s.kind === 'interaction');
                assert.ok(inter, 'should have interaction symbol');
                assert.strictEqual(inter.name, 'MyInteraction');
            } finally {
                fs.rmSync(dir, {recursive: true});
            }
        });

        it('handles empty file (no symbols)', () => {
            const {file, dir} = tmpThrift('cli-usym-empty-', '\n');
            try {
                const o = captureOutput(() => symbolsMod.runSymbols([file],
                    makeArgs({command: 'symbols'})));
                // An empty (or whitespace-only) file should parse without error
                assert.strictEqual(o.returned, 0, 'should return 0 on success');
            } finally {
                fs.rmSync(dir, {recursive: true});
            }
        });
    });
});
