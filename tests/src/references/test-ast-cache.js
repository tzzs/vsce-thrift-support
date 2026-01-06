const path = require('path');

const vscode = require('../../mock_vscode');
const { createTextDocument, createVscodeMock, installVscodeMock } = vscode;

const mock = createVscodeMock();
installVscodeMock(mock);

const { AstCache } = require('../../../out/references/ast-cache.js');

function run() {
    console.log('\nRunning references AST cache tests...');

    const cache = new AstCache(60 * 1000);
    const uri = mock.Uri.file(path.join(__dirname, 'test-files', 'main.thrift'));
    const doc = createTextDocument('struct User { 1: i32 id }', uri);

    const first = cache.get(doc);
    const second = cache.get(doc);

    if (first !== second) {
        throw new Error('Expected cached AST to be reused for the same document');
    }

    cache.clear();
    const third = cache.get(doc);
    if (third === first) {
        throw new Error('Expected cache clear to force a new AST');
    }

    console.log('✅ References AST cache tests passed!');
}

try {
    run();
} catch (error) {
    console.error('❌ References AST cache tests failed:', error.message);
    process.exit(1);
}
