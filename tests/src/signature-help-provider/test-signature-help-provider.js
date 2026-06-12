require('../../require-hook');
const assert = require('assert');
const vscode = require('vscode');
const {ThriftSignatureHelpProvider} = require('../../../out/signature-help-provider.js');

function createDoc(text) {
    const lines = text.split('\n');
    return {
        languageId: 'thrift',
        version: 1,
        uri: vscode.Uri.file('/workspace/service.thrift'),
        getText: () => text,
        lineCount: lines.length,
        lineAt: (line) => ({text: lines[line] || ''})
    };
}

describe('signature-help-provider', () => {
    it('shows service method field signatures and active parameter', () => {
        const text = [
            'service Users {',
            '  User getUser(1: required i32 id, 2: optional string region) throws (1: UserError err)',
            '}'
        ].join('\n');
        const doc = createDoc(text);
        const provider = new ThriftSignatureHelpProvider();

        const help = provider.provideSignatureHelp(
            doc,
            new vscode.Position(1, text.split('\n')[1].indexOf('region')),
            {isCancellationRequested: false}
        );

        assert.ok(help, 'expected signature help');
        assert.strictEqual(help.signatures.length, 1);
        assert.strictEqual(help.activeParameter, 1);
        assert.strictEqual(
            help.signatures[0].label,
            'User getUser(1: required i32 id, 2: optional string region) throws (1: required UserError err)'
        );
    });

    it('returns undefined outside service and interaction method parameter lists', () => {
        const doc = createDoc('struct User {\n  1: i32 id\n}');
        const provider = new ThriftSignatureHelpProvider();

        const help = provider.provideSignatureHelp(
            doc,
            new vscode.Position(1, 8),
            {isCancellationRequested: false}
        );

        assert.strictEqual(help, undefined);
    });
});
