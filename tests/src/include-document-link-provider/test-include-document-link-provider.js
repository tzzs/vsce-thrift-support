const assert = require('assert');
const path = require('path');
const vscode = require('../../mock_vscode');

const {ThriftIncludeDocumentLinkProvider} = require('../../../out/include-document-link-provider');

function createDocument(filePath, text) {
    const lines = text.split('\n');
    return {
        uri: vscode.Uri.file(filePath),
        languageId: 'thrift',
        version: 1,
        getText: () => text,
        lineAt: (line) => ({text: lines[line] ?? ''})
    };
}

describe('ThriftIncludeDocumentLinkProvider', function () {
    it('creates document links for include paths', async function () {
        const provider = new ThriftIncludeDocumentLinkProvider();
        const filePath = path.join('/tmp', 'thrift-links', 'main.thrift');
        const document = createDocument(filePath, 'namespace js demo\ninclude "shared/user.thrift"\n');

        const links = await provider.provideDocumentLinks(document, {isCancellationRequested: false});

        assert.strictEqual(links.length, 1);
        assert.strictEqual(links[0].target.fsPath, path.join('/tmp', 'thrift-links', 'shared', 'user.thrift'));
        assert.deepStrictEqual(
            {
                start: links[0].range.start,
                end: links[0].range.end
            },
            {
                start: new vscode.Position(1, 9),
                end: new vscode.Position(1, 27)
            }
        );
    });

    it('returns no links for non-thrift documents or cancelled requests', async function () {
        const provider = new ThriftIncludeDocumentLinkProvider();
        const thriftDocument = createDocument('/tmp/main.thrift', 'include "shared.thrift"\n');
        const textDocument = {...thriftDocument, languageId: 'plaintext'};

        assert.deepStrictEqual(await provider.provideDocumentLinks(textDocument, {isCancellationRequested: false}), []);
        assert.deepStrictEqual(await provider.provideDocumentLinks(thriftDocument, {isCancellationRequested: true}), []);
    });

    it('does not create links for include paths outside the workspace root', async function () {
        const provider = new ThriftIncludeDocumentLinkProvider();
        const document = createDocument(
            '/tmp/thrift-links/main.thrift',
            'include "../outside.thrift"\ninclude "/etc/passwd"\ninclude "shared.thrift"\n'
        );

        const originalWorkspaceFolders = vscode.workspace.workspaceFolders;
        vscode.workspace.workspaceFolders = [{uri: vscode.Uri.file('/tmp/thrift-links')}];

        try {
            const links = await provider.provideDocumentLinks(document, {isCancellationRequested: false});
            assert.deepStrictEqual(links.map(link => link.target.fsPath), [
                path.join('/tmp', 'thrift-links', 'shared.thrift')
            ]);
        } finally {
            vscode.workspace.workspaceFolders = originalWorkspaceFolders;
        }
    });
});
