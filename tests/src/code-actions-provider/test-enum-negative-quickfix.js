require('../../require-hook');
const assert = require('assert');
const vscode = require('vscode');
const {ThriftRefactorCodeActionProvider} = require('../../../out/code-actions-provider.js');

function createDoc(text) {
    const lines = text.split('\n');
    return {
        languageId: 'thrift',
        version: 1,
        uri: vscode.Uri.file('/workspace/enums.thrift'),
        getText: (range) => {
            if (!range) return text;
            if (range.start.line === range.end.line) {
                return lines[range.start.line].slice(range.start.character, range.end.character);
            }
            return text;
        },
        lineCount: lines.length,
        lineAt: (line) => ({text: lines[line] || ''})
    };
}

describe('enum negative value quick fix', () => {
    it('offers the next non-negative enum value', async () => {
        const text = [
            'enum Status {',
            '  ACTIVE = 0,',
            '  PENDING = 2,',
            '  BROKEN = -1',
            '}'
        ].join('\n');
        const doc = createDoc(text);
        const range = new vscode.Range(3, 11, 3, 13);
        const diagnostic = new vscode.Diagnostic(range, 'Enum value must be non-negative');
        diagnostic.code = 'enum.negativeValue';
        const provider = new ThriftRefactorCodeActionProvider();

        const actions = await provider.provideCodeActions(
            doc,
            range,
            {diagnostics: [diagnostic]},
            {isCancellationRequested: false}
        );

        const fix = actions.find(action => action.title === 'Change enum value to 3');
        assert.ok(fix, 'expected enum negative quick fix');
        assert.deepStrictEqual(fix.edit.edits, [{
            type: 'replace',
            uri: doc.uri,
            range,
            newText: '3'
        }]);
    });
});
