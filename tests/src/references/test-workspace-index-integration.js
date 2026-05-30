const assert = require('assert');
const vscode = require('vscode');
const {ThriftReferencesProvider} = require('../../../out/references-provider.js');

describe('ThriftReferencesProvider WorkspaceIndex integration', function () {
    it('uses indexed files and text for cross-file references', async function () {
        const currentUri = vscode.Uri.file('/workspace/main.thrift');
        const otherUri = vscode.Uri.file('/workspace/other.thrift');
        const currentText = 'struct User { 1: string name }\nstruct Local { 1: User user }\n';
        const otherText = 'struct Other {\n  1: User owner\n}\n';
        const provider = new ThriftReferencesProvider({
            workspaceIndex: {
                getAllFiles: () => [currentUri, otherUri],
                getText: async uri => uri.toString() === otherUri.toString() ? otherText : currentText
            }
        });
        const document = vscode.createTextDocument(currentText, currentUri);
        document.languageId = 'thrift';
        document.version = 1;

        const refs = await provider.provideReferences(
            document,
            new vscode.Position(0, 7),
            {includeDeclaration: true},
            {isCancellationRequested: false}
        );

        assert.ok(refs.some(ref => ref.uri.toString() === otherUri.toString()));
    });
});
