require('../../require-hook');
const assert = require('assert');
const vscode = require('vscode');
const {ThriftRefactorCodeActionProvider} = require('../../../out/code-actions-provider.js');

function createDoc(text) {
    const lines = text.split('\n');
    const lineOffsets = [];
    let offset = 0;
    for (let i = 0; i < lines.length; i++) {
        lineOffsets.push(offset);
        offset += lines[i].length + (i < lines.length - 1 ? 1 : 0);
    }
    const offsetAt = (position) => lineOffsets[position.line] + position.character;
    return {
        languageId: 'thrift',
        version: 1,
        uri: vscode.Uri.file('/workspace/actions.thrift'),
        getText: (range) => {
            if (!range) return text;
            return text.slice(offsetAt(range.start), offsetAt(range.end));
        },
        lineCount: lines.length,
        lineAt: (line) => ({text: lines[line] || ''})
    };
}

async function getQuickFix(text, range, code, expectedTitle) {
    const doc = createDoc(text);
    const diagnostic = new vscode.Diagnostic(range, code);
    diagnostic.code = code;
    const provider = new ThriftRefactorCodeActionProvider();
    const actions = await provider.provideCodeActions(
        doc,
        range,
        {diagnostics: [diagnostic]},
        {isCancellationRequested: false}
    );
    return {
        doc,
        action: actions.find(candidate => candidate.title === expectedTitle)
    };
}

describe('P1 quick fixes', () => {
    it('removes throws clauses from oneway methods', async () => {
        const text = [
            'exception Problem {',
            '  1: string message',
            '}',
            'service S {',
            '  oneway void ping() throws (1: Problem problem)',
            '}'
        ].join('\n');

        const {doc, action} = await getQuickFix(
            text,
            new vscode.Range(4, 2, 4, 49),
            'service.oneway.hasThrows',
            'Remove throws clause from oneway method'
        );

        assert.ok(action, 'expected oneway throws quick fix');
        assert.deepStrictEqual(action.edit.edits, [{
            type: 'replace',
            uri: doc.uri,
            range: new vscode.Range(4, 20, 4, 48),
            newText: ''
        }]);
    });

    it('converts a local struct used in throws to exception', async () => {
        const text = [
            'struct Problem {',
            '  1: string message',
            '}',
            'service S {',
            '  void ping() throws (1: Problem problem)',
            '}'
        ].join('\n');

        const {doc, action} = await getQuickFix(
            text,
            new vscode.Range(4, 22, 4, 40),
            'service.throws.notException',
            'Convert struct "Problem" to exception'
        );

        assert.ok(action, 'expected throws type conversion quick fix');
        assert.deepStrictEqual(action.edit.edits, [{
            type: 'replace',
            uri: doc.uri,
            range: new vscode.Range(0, 0, 0, 6),
            newText: 'exception'
        }]);
    });

    it('inserts a clear missing closer for unclosed braces', async () => {
        const text = [
            'struct User {',
            '  1: i32 id'
        ].join('\n');

        const {doc, action} = await getQuickFix(
            text,
            new vscode.Range(0, 12, 0, 13),
            'syntax.unclosed',
            "Insert missing '}'"
        );

        assert.ok(action, 'expected syntax closer quick fix');
        assert.deepStrictEqual(action.edit.edits, [{
            type: 'insert',
            uri: doc.uri,
            position: new vscode.Position(1, 11),
            newText: '\n}'
        }]);
    });
});
