// Diagnostics unit test: service extends with namespaced parent
const assert = require('assert');
const {analyzeThriftText} = require('../../../out/diagnostics');
const {createVscodeMock, installVscodeMock} = require('../../mock_vscode.js');
Module.prototype.require = originalRequire;

function findByCode(issues, code) {
    return issues.filter(i => i.code === code);
}

function run() {
    console.log('\nRunning namespaced extends diagnostics test...');

    const text = [
        'include "shared.thrift"',
        'service UserService extends shared.SharedService {}',
    ].join('\n');

    const includedTypes = new Map([['SharedService', 'service']]);
    const issues = analyzeThriftText(text, undefined, includedTypes);

    assert.strictEqual(findByCode(issues, 'service.extends.unknown').length, 0, 'should recognize namespaced parent service');
    assert.strictEqual(findByCode(issues, 'service.extends.notService').length, 0, 'parent should be recognized as service');

    console.log('✓ Namespaced extends test passed');
}

run();
