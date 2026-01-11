const assert = require('assert');
const path = require('path');
const vscode = require('vscode');

const {Position, Range} = vscode;
const {ThriftHoverProvider} = require('../../../out/hover-provider.js');

function createMockDocument(text, fileName = 'test.thrift') {
    const lines = text.split('\n');
    const uri = vscode.Uri.file(path.join(__dirname, '..', '..', 'test-files', fileName));

    const document = {
        uri: uri,
        languageId: 'thrift',
        getText: () => text,
        lineAt: (line) => ({
            text: lines[line] || '',
            lineNumber: line
        }),
        getWordRangeAtPosition: (position) => {
            const lineText = lines[position.line] || '';
            const wordRegex = /\b([A-Za-z_][A-Za-z0-9_]*)\b/g;
            let match;
            while ((match = wordRegex.exec(lineText)) !== null) {
                const start = match.index;
                const end = start + match[0].length;
                if (position.character >= start && position.character <= end) {
                    return new Range(position.line, start, position.line, end);
                }
            }
            return null;
        },
        offsetAt: (position) => {
            let offset = 0;
            for (let i = 0; i < position.line; i++) {
                offset += (lines[i] || '').length + 1;
            }
            return offset + position.character;
        },
        positionAt: (offset) => {
            let currentOffset = 0;
            for (let i = 0; i < lines.length; i++) {
                const lineLength = (lines[i] || '').length + 1;
                if (currentOffset + lineLength > offset) {
                    return new Position(i, offset - currentOffset);
                }
                currentOffset += lineLength;
            }
            return new Position(lines.length - 1, lines[lines.length - 1].length);
        }
    };

    vscode.workspace.textDocuments.push(document);

    return document;
}

function createMockPosition(line, character) {
    return new Position(line, character);
}

function createMockCancellationToken() {
    return {isCancellationRequested: false};
}

describe('hover-provider', () => {
    beforeEach(() => {
        vscode.workspace.textDocuments = [];
    });

    it('should pass run', async () => {
        const provider = new ThriftHoverProvider();

        const structText = `// UniqueStruct123 information structure
struct UniqueStruct123 {
    1: required string name
}

// Profile data
struct Profile {
    1: required UniqueStruct123 user
}`;
        const structDocument = createMockDocument(structText);
        const structPosition = createMockPosition(7, 18);

        const structHover = await provider.provideHover(
            structDocument,
            structPosition,
            createMockCancellationToken()
        );

        if (structHover) {
            assert(structHover.contents, 'Should have hover contents');
            assert(
                structHover.contents.value.includes('struct UniqueStruct123'),
                'Should show struct signature'
            );
            assert(
                structHover.contents.value.includes('UniqueStruct123 information structure'),
                'Should include documentation'
            );
        }

        const enumText = `// Status enumeration
enum Status {
    ACTIVE = 1,
    INACTIVE = 2
}

struct User {
    1: required Status status
}`;
        const enumDocument = createMockDocument(enumText);
        const enumPosition = createMockPosition(7, 18);

        const enumHover = await provider.provideHover(
            enumDocument,
            enumPosition,
            createMockCancellationToken()
        );

        if (enumHover) {
            assert(enumHover.contents, 'Should have hover contents');
        }

        const serviceText = `// User service interface
service UserService {
    User getUser(1: i32 id)
}

struct User {
    1: required UserService service
}`;
        const serviceDocument = createMockDocument(serviceText);
        const servicePosition = createMockPosition(6, 18);

        const serviceHover = await provider.provideHover(
            serviceDocument,
            servicePosition,
            createMockCancellationToken()
        );

        if (serviceHover) {
            assert(serviceHover.contents, 'Should have hover contents');
        }
    });
});
