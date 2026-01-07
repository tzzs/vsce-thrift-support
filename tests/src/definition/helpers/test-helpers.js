const assert = require('assert');

const {
    createVscodeMock,
    installVscodeMock
} = require('../../../mock_vscode.js');

const vscode = createVscodeMock({
    languages: {
        createDiagnosticCollection: () => ({
            set: () => {},
            delete: () => {},
            clear: () => {}
        })
    }
});
installVscodeMock(vscode);

const {
    getWordRangeAtPosition,
    getIncludedFiles,
    isPrimitiveType,
    fileDeclaresNamespace
} = require('../../../../out/definition/helpers.js');

function createDoc(content, pathSuffix) {
    const uri = vscode.Uri.file(`/tmp/${pathSuffix}`);
    const document = vscode.createTextDocument(content, uri);
    document.languageId = 'thrift';
    document.uri = uri;
    document.lineCount = content.split('\n').length;
    return document;
}

async function run() {
    console.log('\nRunning definition helpers tests...');

    const doc = createDoc('include "foo.thrift"\nnamespace java com.example', 'main.thrift');
    const range = getWordRangeAtPosition(doc, new vscode.Position(0, 10));
    assert(range?.start.character < range?.end.character, 'Word range should cover include filename');

    assert.strictEqual(isPrimitiveType('i32'), true, 'Should recognize primitive type');
    assert.strictEqual(isPrimitiveType('User'), false, 'Should not treat user type as primitive');

    assert.ok(fileDeclaresNamespace('namespace java com.example', 'com.example'));
    assert.ok(!fileDeclaresNamespace('namespace java com.example', 'other'));

    const includes = await getIncludedFiles(doc, {handleWarning: () => {}, handleError: () => {}});
    assert.strictEqual(includes.length, 1, 'Should collect include URIs');

    console.log('✅ Definition helper tests passed!');
}

run().catch(err => {
    console.error('❌ Definition helper tests failed:', err);
    process.exit(1);
});
