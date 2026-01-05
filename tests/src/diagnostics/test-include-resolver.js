const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {createVscodeMock, installVscodeMock} = require('../../mock_vscode.js');

const vscode = createVscodeMock();
installVscodeMock(vscode);

const {
    collectIncludedTypes,
    collectIncludedTypesFromCache,
    getIncludedFiles
} = require('../../../out/diagnostics/include-resolver.js');

function createDoc(text, filePath) {
    const uri = vscode.Uri.file(filePath);
    const doc = vscode.createTextDocument(text, uri);
    doc.languageId = 'thrift';
    doc.uri = uri;
    doc.lineCount = text.split('\n').length;
    return doc;
}

async function run() {
    console.log('\nRunning include resolver test...');

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'thrift-include-'));
    const includePath = path.join(tempDir, 'inc.thrift');
    const mainPath = path.join(tempDir, 'main.thrift');

    fs.writeFileSync(includePath, 'struct Included { 1: i32 id }', 'utf8');
    fs.writeFileSync(mainPath, 'include \"inc.thrift\"\\n\\nstruct Main { 1: Included item }', 'utf8');

    const doc = createDoc(fs.readFileSync(mainPath, 'utf8'), mainPath);
    const includedFiles = await getIncludedFiles(doc);
    assert.strictEqual(includedFiles.length, 1, 'Expected one include file');
    assert.strictEqual(includedFiles[0].fsPath, includePath, 'Expected include path to match');

    const includedTypes = await collectIncludedTypes(doc);
    assert.strictEqual(includedTypes.get('Included'), 'struct', 'Expected included struct type');

    const cachedTypes = collectIncludedTypesFromCache(includedFiles);
    assert.ok(cachedTypes, 'Expected cached types to be available');
    assert.strictEqual(cachedTypes.get('Included'), 'struct', 'Expected cached struct type');

    fs.rmSync(tempDir, {recursive: true, force: true});

    console.log('✅ Include resolver test passed!');
}

run().catch((error) => {
    console.error(error);
    process.exit(1);
});
