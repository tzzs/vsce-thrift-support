const path = require('path');

const {ThriftParser} = require('../../../out/ast/parser.js');
const nodes = require('../../../out/ast/nodes.types.js');
const {findNodeAtPosition} = require('../../../out/references/node-locator.js');

describe('node-locator', () => {
    let vscode;
    let createTextDocument;

    before(() => {
        vscode = require('vscode');
        createTextDocument = (text, uri) => {
            return {
                getText: () => text,
                uri: uri,
                languageId: 'thrift'
            };
        };
    });

    it('should pass all test assertions', () => {

        const content = [
            'struct User {',
            '  1: i32 id',
            '}'
        ].join('\n');

        const uri = vscode.Uri.file(path.join(__dirname, 'test-files', 'main.thrift'));
        const doc = createTextDocument(content, uri);
        const ast = new ThriftParser(doc).parse();

        const position = new vscode.Position(1, 6);
        const node = findNodeAtPosition(ast, position);

        if (!node || node.type !== nodes.ThriftNodeType.Field) {
            throw new Error(`Expected to find Field node, got ${node ? node.type : 'none'}`);
        }

    });
});
