const assert = require('assert');
const path = require('path');
const vscode = require('vscode');

const {ThriftReferencesProvider} = require('../../../out/references-provider.js');

function createMockDocument(text, fileName = 'test.thrift') {
    const lines = text.split('\n');
    return {
        uri: vscode.Uri.file(path.join(__dirname, '../../test-files', fileName)),
        languageId: 'thrift',
        getText: (range) => {
            if (
                !range ||
                !range.start ||
                !range.end ||
                range.start.line === undefined ||
                range.start.character === undefined ||
                range.end.line === undefined ||
                range.end.character === undefined
            ) {
                return text;
            }
            const startLine = range.start.line;
            const endLine = range.end.line;
            const startChar = range.start.character;
            const endChar = range.end.character;

            if (startLine === endLine) {
                return lines[startLine].substring(startChar, endChar);
            } else {
                let result = lines[startLine].substring(startChar);
                for (let i = startLine + 1; i < endLine; i++) {
                    result += '\n' + lines[i];
                }
                result += '\n' + lines[endLine].substring(0, endChar);
                return result;
            }
        },
        lineAt: (line) => ({text: lines[line] || ''}),
        getWordRangeAtPosition: (position) => {
            const lineText = lines[position.line] || '';
            const wordRegex = /\b([A-Za-z_][A-Za-z0-9_]*)\b/g;
            let match;
            while ((match = wordRegex.exec(lineText)) !== null) {
                if (
                    position.character >= match.index &&
                    position.character <= match.index + match[0].length
                ) {
                    return new vscode.Range(
                        position.line,
                        match.index,
                        position.line,
                        match.index + match[0].length
                    );
                }
            }
            return null;
        }
    };
}

describe('references-provider-functionality', () => {
    it('should find references correctly', async () => {
        const provider = new ThriftReferencesProvider();

        const testDocument = createMockDocument(`struct User {
  1: required i32 id,
  2: optional string name
}

service UserService {
  User getUser(1: i32 userId)
}`);

        const userPosition = new vscode.Position(0, 7);
        const references = await provider.provideReferences(
            testDocument,
            userPosition,
            {includeDeclaration: true},
            {isCancellationRequested: false}
        );

        assert(Array.isArray(references), 'References should be an array');

        const excludeReferences = await provider.provideReferences(
            testDocument,
            userPosition,
            {includeDeclaration: false},
            {isCancellationRequested: false}
        );

        assert(Array.isArray(excludeReferences), 'References should be an array');
    });
});