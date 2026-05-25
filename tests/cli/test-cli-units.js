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
    });

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
});
