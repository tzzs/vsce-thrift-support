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

describe('test-helpers', function () {
    function createDoc(content, pathSuffix) {
        const uri = vscode.Uri.file(`/tmp/${pathSuffix}`);
        const document = vscode.createTextDocument(content, uri);
        document.languageId = 'thrift';
        document.uri = uri;
        document.lineCount = content.split('\n').length;
        return document;
    }

    it('should calculate word range correctly', async function () {
        const doc = createDoc('include "foo.thrift"\nnamespace java com.example', 'main.thrift');
        const range = getWordRangeAtPosition(doc, new vscode.Position(0, 10));
        assert(range?.start.character < range?.end.character, 'Word range should cover include filename');
    });

    it('should recognize primitive types', function () {
        assert.strictEqual(isPrimitiveType('i32'), true, 'Should recognize primitive type');
        assert.strictEqual(isPrimitiveType('User'), false, 'Should not treat user type as primitive');
    });

    it('should detect namespace declarations', function () {
        assert.ok(fileDeclaresNamespace('namespace java com.example', 'com.example'));
        assert.ok(!fileDeclaresNamespace('namespace java com.example', 'other'));
    });

    it('should collect included files', async function () {
        const doc = createDoc('include "foo.thrift"\nnamespace java com.example', 'main.thrift');
        const includes = await getIncludedFiles(doc, { handleWarning: () => { }, handleError: () => { } });
        assert.strictEqual(includes.length, 1, 'Should collect include URIs');
    });
});
