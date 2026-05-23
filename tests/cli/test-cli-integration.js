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

function run(args, options = {}) {
    const result = spawnSync(process.execPath, [CLI, ...args], {
        encoding: 'utf8',
        env: {...process.env},
        ...options
    });
    return {
        code: result.status,
        stdout: result.stdout || '',
        stderr: result.stderr || ''
    };
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

        it('exits non-zero for non-existent file', () => {
            const {code} = run(['format', '--check', '/nonexistent/file.thrift']);
            assert.notStrictEqual(code, 0);
        });
    });

    describe('lint command', () => {
        it('exits 0 for a valid thrift file', () => {
            const {code} = run(['lint', SAMPLE]);
            assert.strictEqual(code, 0, 'valid file should lint clean');
        });

        it('--json flag outputs JSON array', () => {
            const {code, stdout} = run(['lint', '--json', SAMPLE]);
            assert.strictEqual(code, 0);
            const issues = JSON.parse(stdout);
            assert.ok(Array.isArray(issues), 'should output JSON array');
        });

        it('exits non-zero for missing file', () => {
            const {code} = run(['lint', '/nonexistent/file.thrift']);
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

        it('exits non-zero for non-existent file', () => {
            const {code} = run(['parse', '/nonexistent/file.thrift']);
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
