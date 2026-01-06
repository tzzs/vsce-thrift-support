const path = require('path');

const vscode = require('../../mock_vscode');
const { createTextDocument, createVscodeMock, installVscodeMock, Position } = vscode;

const mock = createVscodeMock();
installVscodeMock(mock);

const { ThriftParser } = require('../../../out/ast/parser.js');
const nodes = require('../../../out/ast/nodes.types.js');
const { findNodeAtPosition } = require('../../../out/references/node-locator.js');

function run() {
    console.log('\nRunning references node locator tests...');

    const content = [
        'struct User {',
        '  1: i32 id',
        '}'
    ].join('\n');

    const uri = mock.Uri.file(path.join(__dirname, 'test-files', 'main.thrift'));
    const doc = createTextDocument(content, uri);
    const ast = new ThriftParser(doc).parse();

    const position = new Position(1, 6);
    const node = findNodeAtPosition(ast, position);

    if (!node || node.type !== nodes.ThriftNodeType.Field) {
        throw new Error(`Expected to find Field node, got ${node ? node.type : 'none'}`);
    }

    console.log('✅ References node locator tests passed!');
}

try {
    run();
} catch (error) {
    console.error('❌ References node locator tests failed:', error.message);
    process.exit(1);
}
