const path = require('path');

const {AstCache} = require('../../../out/references/ast-cache.js');

describe('ast-cache', () => {
    let vscode;
    let createTextDocument;

    before(() => {
        vscode = require('vscode');
        // 使用 require-hook 提供的 mock 中的方法
        createTextDocument = (text, uri) => {
            return {
                getText: () => text,
                uri: uri,
                languageId: 'thrift'
            };
        };
    });

    it('should pass all test assertions', () => {

        const cache = new AstCache(60 * 1000);
        const uri = vscode.Uri.file(path.join(__dirname, 'test-files', 'main.thrift'));
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

    });
});
