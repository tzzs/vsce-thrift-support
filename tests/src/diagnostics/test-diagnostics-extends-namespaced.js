// Diagnostics unit test: service extends with namespaced parent
const assert = require('assert');
const {analyzeThriftText} = require('../../../out/src/diagnostics.js');
const {createVscodeMock, installVscodeMock} = require('../../test-helpers/vscode-mock');
Module.prototype.require = originalRequire;

function findByCode(issues, code) {
    return issues.filter(i => i.code === code);
}

function run() {
    console.log('\nRunning namespaced extends diagnostics test...');

    const text = [
        'service SharedService {}',
        'service UserService extends shared.SharedService {}',
    ].join('\n');

    const issues = analyzeThriftText(text);

    assert.strictEqual(findByCode(issues, 'service.extends.unknown').length, 0, 'should recognize namespaced parent service');
    assert.strictEqual(findByCode(issues, 'service.extends.notService').length, 0, 'parent should be recognized as service');

    console.log('✓ Namespaced extends test passed');
}

run();