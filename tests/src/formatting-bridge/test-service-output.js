const assert = require('assert');

const {ThriftFormattingProvider} = require('../../../out/formatting-bridge/index.js');
const vscode = require('vscode');

describe('service-output', () => {
    let provider;

    before(() => {
        provider = new ThriftFormattingProvider();
    });

    it('should format service methods correctly', () => {
        const document = {
            uri: vscode.Uri.file('/test/service.thrift'),
            getText: () => 'service UserService{User getUser(1:i32 id);void createUser(1:User user);}',
            lineCount: 1,
            positionAt: (offset) => {
                return {line: 0, character: Math.min(offset, 73)};
            }
        };

        const range = {
            start: {line: 0, character: 0},
            end: {line: 0, character: 73}
        };

        const edits = provider.provideDocumentRangeFormattingEdits(
            document,
            range,
            {tabSize: 4, insertSpaces: true, indentSize: 4},
            {}
        );

        assert.ok(edits && edits.length > 0, 'Should return formatting edits');
        assert.ok(edits[0].newText.includes('service UserService'), 'Should contain service declaration');
        assert.ok(edits[0].newText.includes('User getUser'), 'Should contain getUser method');
        assert.ok(edits[0].newText.includes('void createUser'), 'Should contain createUser method');
    });
});
