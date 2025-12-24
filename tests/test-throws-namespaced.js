// Diagnostics unit test: service method throws with namespaced exception
const assert = require('assert');
const Module = require('module');
const originalRequire = Module.prototype.require;

// Minimal vscode mock to satisfy diagnostics module
const vscode = {
    DiagnosticSeverity: {
        Error: 0,
        Warning: 1,
        Information: 2,
        Hint: 3,
    },
    Position: function (line, character) {
        return {line, character};
    },
    Range: function (startLine, startChar, endLine, endChar) {
        return {start: {line: startLine, character: startChar}, end: {line: endLine, character: endChar}};
    },
};

Module.prototype.require = function (id) {
    if (id === 'vscode') return vscode;
    return originalRequire.apply(this, arguments);
};

const {analyzeThriftText} = require('../out/src/diagnostics.js');
Module.prototype.require = originalRequire;

function findByCode(issues, code) {
    return issues.filter(i => i.code === code);
}

function run() {
    console.log('\nRunning namespaced throws diagnostics test...');

    const text = [
        'exception MyError {}',
        'service S {',
        '  i32 doThing() throws (1: shared.MyError err)',
        '}',
    ].join('\n');

    const issues = analyzeThriftText(text);

    assert.strictEqual(findByCode(issues, 'service.throws.unknown').length, 0, 'should recognize namespaced exception in throws');

    console.log('✓ Namespaced throws test passed');
}

run();