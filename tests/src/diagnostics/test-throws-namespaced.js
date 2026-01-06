// Diagnostics unit test: service method throws with namespaced exception
const assert = require('assert');
const {analyzeThriftText} = require('../../../out/diagnostics');
const {createVscodeMock, installVscodeMock} = require('../../mock_vscode.js');
Module.prototype.require = originalRequire;

function findByCode(issues, code) {
    return issues.filter(i => i.code === code);
}

function run() {
    console.log('\nRunning namespaced throws diagnostics test...');

    const text = [
        'include "shared.thrift"',
        'exception MyError {}',
        'service S {',
        '  i32 doThing() throws (1: shared.MyError err)',
        '}',
    ].join('\n');

    const includedTypes = new Map([['MyError', 'exception']]);
    const issues = analyzeThriftText(text, undefined, includedTypes);

    assert.strictEqual(findByCode(issues, 'service.throws.unknown').length, 0, 'should recognize namespaced exception in throws');

    console.log('✓ Namespaced throws test passed');
}

run();
