const assert = require('assert');
const vscode = require('vscode');

const {ThriftFormattingProvider} = require('../../../out/formatting-bridge/index.js');

describe('complex-types', () => {
    let formatter;

    before(() => {
        formatter = new ThriftFormattingProvider();
    });

    it('should format complex types correctly', () => {
        const testCode = `struct TestStruct {
    1: required list < string > names,
    2: optional map< string , i32 > values  ,
    3: i32 count
}`;

        const document = {
            uri: {fsPath: '/test/format.thrift'},
            getText: () => testCode,
            lineAt: (i) => {
                const lines = testCode.split('\n');
                return {text: lines[i] || ''};
            },
            positionAt: (offset) => {
                const lines = testCode.split('\n');
                let currentOffset = 0;
                for (let line = 0; line < lines.length; line++) {
                    const lineLength = lines[line].length + 1; // +1 for newline
                    if (offset <= currentOffset + lineLength - 1) {
                        const character = offset - currentOffset;
                        return new vscode.Position(line, Math.max(0, character));
                    }
                    currentOffset += lineLength;
                }
                return new vscode.Position(lines.length - 1, lines[lines.length - 1].length);
            },
            lineCount: testCode.split('\n').length
        };

        const options = {insertSpaces: true, tabSize: 4};

        // Calculate the full range of the document
        const lines = testCode.split('\n');
        const lastLineIndex = Math.max(0, lines.length - 1);
        const lastLineLength = lines[lastLineIndex] ? lines[lastLineIndex].length : 0;
        const fullRange = new vscode.Range(
            new vscode.Position(0, 0),
            new vscode.Position(lastLineIndex, lastLineLength)
        );

        // Use range formatting instead of document formatting
        const edits = formatter.provideDocumentRangeFormattingEdits(document, fullRange, options);

        assert.ok(edits && edits.length > 0, 'Should return formatting edits');

        // Apply the edits to get the formatted text
        let result = testCode;
        const offsetAt = (text, position) => {
            const textLines = text.split('\n');
            let offset = 0;
            for (let line = 0; line < position.line; line++) {
                offset += (textLines[line] || '').length + 1; // +1 for newline
            }
            return offset + position.character;
        };

        for (const edit of edits.reverse()) {
            const startOffset = offsetAt(result, edit.range.start);
            const endOffset = offsetAt(result, edit.range.end);
            result = result.substring(0, startOffset) + edit.newText + result.substring(endOffset);
        }

        const hasCorrectList = result.includes('list<string>');
        const hasCorrectMap = result.includes('map<string,i32>');

        assert.ok(hasCorrectList, 'Should format list<string> without spaces');
        assert.ok(hasCorrectMap, 'Should format map<string,i32> without spaces');
    });
});
