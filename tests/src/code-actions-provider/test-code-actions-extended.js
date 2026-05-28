const assert = require('assert');
const {ThriftRefactorCodeActionProvider} = require('../../../out/code-actions-provider.js');

describe('CodeActionProvider extended', () => {
    let vscode;

    before(() => {
        vscode = require('vscode');
    });

    function createDoc(languageId, text, wordRange = null) {
        const lines = text.split('\n');
        return {
            languageId,
            uri: vscode.Uri.file('/tmp/test-actions.thrift'),
            getText: (range) => {
                if (!range) return text;
                return text.substring(0, Math.min(text.length, 100));
            },
            lineCount: lines.length,
            lineAt: (line) => ({text: lines[line] || ''}),
            getWordRangeAtPosition: () => wordRange,
            offsetAt: (pos) => 0,
            positionAt: (offset) => new vscode.Position(0, 0)
        };
    }

    it('should return minimum 2 code actions for valid thrift', async () => {
        const provider = new ThriftRefactorCodeActionProvider();
        const doc = createDoc('thrift', 'struct Foo {\n  1: i32 id\n}');
        const range = new vscode.Selection(new vscode.Position(0, 0), new vscode.Position(0, 6));
        const actions = await provider.provideCodeActions(doc, range, {diagnostics: []}, undefined);
        assert.ok(Array.isArray(actions));
        assert.ok(actions.length >= 2);
    });

    it('should return undefined for non-thrift document', async () => {
        const provider = new ThriftRefactorCodeActionProvider();
        const doc = createDoc('json', '{"key": "value"}');
        const range = new vscode.Selection(new vscode.Position(0, 0), new vscode.Position(0, 6));
        const actions = await provider.provideCodeActions(doc, range, {diagnostics: []}, undefined);
        assert.strictEqual(actions, undefined);
    });

    it('should return undefined when cancelled', async () => {
        const provider = new ThriftRefactorCodeActionProvider();
        const doc = createDoc('thrift', 'struct Foo {\n  1: i32 id\n}');
        const range = new vscode.Selection(new vscode.Position(0, 0), new vscode.Position(0, 6));
        const token = {isCancellationRequested: true};
        const actions = await provider.provideCodeActions(doc, range, {diagnostics: []}, token);
        assert.strictEqual(actions, undefined);
    });

    it('should still return refactor actions even when lineAt throws', async () => {
        const provider = new ThriftRefactorCodeActionProvider();
        const doc = {
            languageId: 'thrift',
            uri: vscode.Uri.file('/tmp/test-actions.thrift'),
            getText: () => 'struct Foo {',
            lineCount: 1,
            lineAt: () => { throw new Error('lineAt failed'); },
            getWordRangeAtPosition: () => null
        };
        const range = new vscode.Selection(new vscode.Position(0, 0), new vscode.Position(0, 6));
        const actions = await provider.provideCodeActions(doc, range, {diagnostics: []}, undefined);
        assert.ok(Array.isArray(actions));
        assert.strictEqual(actions.length, 2, 'Should return extract + move refactor actions');
    });

    it('should include code action kinds', () => {
        assert.ok(Array.isArray(ThriftRefactorCodeActionProvider.providedCodeActionKinds));
        assert.ok(ThriftRefactorCodeActionProvider.providedCodeActionKinds.length > 0);
    });

    it('should NOT offer include suggestions when no type.unknown diagnostics (P0-3)', async () => {
        const provider = new ThriftRefactorCodeActionProvider();
        const thriftText = 'struct Foo {\n  1: Bar val\n}';
        const doc = createDoc('thrift', thriftText);
        const range = new vscode.Selection(new vscode.Position(1, 5), new vscode.Position(1, 8));
        const actions = await provider.provideCodeActions(doc, range, {diagnostics: []}, undefined);
        assert.ok(Array.isArray(actions));
        assert.strictEqual(actions.length, 2, 'Only extract + move, no include QuickFix');
        assert.ok(actions.every(a => a.kind !== vscode.CodeActionKind.QuickFix));
    });

    it('should offer include suggestion when type.unknown diagnostic is present (P0-3)', async () => {
        const provider = new ThriftRefactorCodeActionProvider();
        const thriftText = 'struct Foo {\n  1: Bar val\n}';
        const sourceUri = vscode.Uri.file('/tmp/project/a.thrift');
        const targetUri = vscode.Uri.file('/tmp/project/b.thrift');
        const targetText = 'struct Bar {\n  1: i32 id\n}';

        const doc = createDoc('thrift', thriftText);
        doc.uri = sourceUri;
        doc.getText = (range) => {
            if (range) return 'Bar';
            return thriftText;
        };

        const origFindFiles = vscode.workspace.findFiles;
        const origTextDocs = vscode.workspace.textDocuments;
        vscode.workspace.findFiles = async () => [targetUri];
        vscode.workspace.textDocuments = [{
            uri: targetUri,
            getText: () => targetText,
            lineCount: 3
        }];

        try {
            const diagRange = new vscode.Range(1, 5, 1, 8);
            const diagnostic = {range: diagRange, message: "Unknown type 'Bar'", severity: 0, code: 'type.unknown'};
            const selRange = new vscode.Selection(new vscode.Position(1, 5), new vscode.Position(1, 8));
            const actions = await provider.provideCodeActions(doc, selRange, {diagnostics: [diagnostic]}, undefined);
            assert.ok(Array.isArray(actions));
            const quickFixes = actions.filter(a => a.kind === vscode.CodeActionKind.QuickFix);
            assert.ok(quickFixes.length >= 1, 'Should have at least one include QuickFix');
            assert.ok(quickFixes[0].title.includes('b.thrift'), `Title should contain real path, got: ${quickFixes[0].title}`);
            assert.ok(quickFixes[0].isPreferred, 'Single candidate should be preferred');
        } finally {
            vscode.workspace.findFiles = origFindFiles;
            vscode.workspace.textDocuments = origTextDocs;
        }
    });

    it('should NOT offer include when workspace has no matching definitions (P0-2)', async () => {
        const provider = new ThriftRefactorCodeActionProvider();
        const thriftText = 'struct Foo {\n  1: Nope val\n}';
        const sourceUri = vscode.Uri.file('/tmp/project/a.thrift');
        const doc = createDoc('thrift', thriftText);
        doc.uri = sourceUri;
        doc.getText = (range) => {
            if (range) return 'Nope';
            return thriftText;
        };

        const origFindFiles = vscode.workspace.findFiles;
        vscode.workspace.findFiles = async () => [];

        try {
            const diagRange = new vscode.Range(1, 5, 1, 9);
            const diagnostic = {range: diagRange, message: "Unknown type 'Nope'", severity: 0, code: 'type.unknown'};
            const selRange = new vscode.Selection(new vscode.Position(1, 5), new vscode.Position(1, 9));
            const actions = await provider.provideCodeActions(doc, selRange, {diagnostics: [diagnostic]}, undefined);
            assert.ok(Array.isArray(actions));
            assert.strictEqual(actions.length, 2, 'Only extract + move, no include suggestion');
        } finally {
            vscode.workspace.findFiles = origFindFiles;
        }
    });

    it('should handle cancellation during workspace scan gracefully (P0-1)', async () => {
        const provider = new ThriftRefactorCodeActionProvider();
        const thriftText = 'struct Foo {\n  1: Bar val\n}';
        const sourceUri = vscode.Uri.file('/tmp/project/a.thrift');
        const doc = createDoc('thrift', thriftText);
        doc.uri = sourceUri;
        doc.getText = (range) => {
            if (range) return 'Bar';
            return thriftText;
        };

        const origFindFiles = vscode.workspace.findFiles;
        let cancelled = false;
        vscode.workspace.findFiles = async () => {
            cancelled = true;
            return [vscode.Uri.file('/tmp/project/b.thrift')];
        };
        vscode.workspace.textDocuments = [{
            uri: vscode.Uri.file('/tmp/project/b.thrift'),
            getText: () => 'struct Bar { 1: i32 id }',
            lineCount: 1
        }];

        try {
            const diagRange = new vscode.Range(1, 5, 1, 8);
            const diagnostic = {range: diagRange, message: "Unknown type 'Bar'", severity: 0, code: 'type.unknown'};
            const selRange = new vscode.Selection(new vscode.Position(1, 5), new vscode.Position(1, 8));
            const token = {get isCancellationRequested() { return cancelled; }};
            const actions = await provider.provideCodeActions(doc, selRange, {diagnostics: [diagnostic]}, token);
            assert.ok(Array.isArray(actions));
            assert.ok(actions.length >= 2, 'Should at least have extract + move');
        } finally {
            vscode.workspace.findFiles = origFindFiles;
            vscode.workspace.textDocuments = [];
        }
    });

    it('should return include suggestions for unqualified identifiers inside struct', async () => {
        const provider = new ThriftRefactorCodeActionProvider();
        const thriftText = 'include "common.thrift"\n\nstruct Foo {\n  1: MyType val\n}';
        const doc = createDoc('thrift', thriftText, new vscode.Range(3, 5, 3, 11));
        const range = new vscode.Selection(new vscode.Position(3, 8), new vscode.Position(3, 8));
        const actions = await provider.provideCodeActions(doc, range, {diagnostics: []}, undefined);
        assert.ok(Array.isArray(actions));
    });

    it('should provide actions for struct with namespace references', async () => {
        const provider = new ThriftRefactorCodeActionProvider();
        const thriftText = 'include "shared.thrift"\n\nstruct Foo {\n  1: shared.UserType val\n}';
        const doc = createDoc('thrift', thriftText, new vscode.Range(3, 5, 3, 17));
        const range = new vscode.Selection(new vscode.Position(3, 12), new vscode.Position(3, 12));
        const actions = await provider.provideCodeActions(doc, range, {diagnostics: []}, undefined);
        assert.ok(Array.isArray(actions));
        assert.ok(actions.length >= 2);
    });
});
