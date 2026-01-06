const assert = require('assert');

const {createVscodeMock, installVscodeMock} = require('../../mock_vscode.js');

const vscode = createVscodeMock({
    window: {
        showErrorMessage: () => Promise.resolve(undefined)
    }
});
installVscodeMock(vscode);

const {diagnosticsTestUtils} = require('../../../out/diagnostics');

function run() {
    console.log('\nRunning diagnostics structural change detection test...');

    const {includesKeyword, hasStructuralTokens, sanitizeStructuralText} = diagnosticsTestUtils;

    assert.strictEqual(includesKeyword('include "foo.thrift"'), true, 'Expected include keyword detection');
    assert.strictEqual(includesKeyword('// include "foo.thrift"'), false, 'Expected comment include to be ignored');
    assert.strictEqual(includesKeyword('"include \\"foo.thrift\\""'), false, 'Expected include in string to be ignored');
    assert.strictEqual(includesKeyword('const string s = "include foo.thrift"'), false, 'Expected include in string assignment to be ignored');

    assert.strictEqual(hasStructuralTokens('struct User {'), true, 'Expected struct keyword detection');
    assert.strictEqual(hasStructuralTokens('{'), true, 'Expected brace to be structural');
    assert.strictEqual(hasStructuralTokens('/* struct User { */'), false, 'Expected block comment to be ignored');
    assert.strictEqual(hasStructuralTokens('// enum Status {'), false, 'Expected line comment to be ignored');
    assert.strictEqual(hasStructuralTokens('note = "struct User {"'), false, 'Expected struct in string to be ignored');
    assert.strictEqual(hasStructuralTokens('field = "{ }"'), false, 'Expected braces in string to be ignored');

    assert.strictEqual(
        sanitizeStructuralText('include "foo.thrift" // include "bar.thrift"').trim(),
        'include',
        'Expected sanitize to drop comment content'
    );

    console.log('✅ Diagnostics structural change detection test passed!');
}

try {
    run();
} catch (err) {
    console.error('❌ Diagnostics structural change detection test failed:', err);
    process.exit(1);
}
