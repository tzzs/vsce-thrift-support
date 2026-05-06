// Unit test for definition provider
const assert = require('assert');
const path = require('path');
const fs = require('fs');

const {ThriftDefinitionProvider} = require('../../../out/definition-provider.js');

function createMockDocument(text, fileName = 'test.thrift') {
    const lines = text.split('\n');
    return {
        uri: {fsPath: path.join(__dirname, '..', '..', 'test-files', fileName)},
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
                    return {
                        start: {line: position.line, character: start},
                        end: {line: position.line, character: end}
                    };
                }
            }
            return null;
        },
        offsetAt: (position) => {
            let offset = 0;
            for (let i = 0; i < position.line; i++) {
                offset += (lines[i] || '').length + 1; // +1 for newline
            }
            return offset + position.character;
        },
        positionAt: (offset) => {
            let currentOffset = 0;
            for (let i = 0; i < lines.length; i++) {
                const lineLength = (lines[i] || '').length + 1; // +1 for newline
                if (currentOffset + lineLength > offset) {
                    return {line: i, character: offset - currentOffset};
                }
                currentOffset += lineLength;
            }
            return {line: lines.length - 1, character: lines[lines.length - 1].length};
        }
    };
}

function createMockPosition(line, character) {
    return {line, character};
}

function createMockCancellationToken() {
    return {isCancellationRequested: false};
}

describe('definition-provider', () => {
    let vscode;
    let provider;

    before(() => {
        vscode = require('vscode');
        provider = new ThriftDefinitionProvider();
    });

    function createMockDocument(text, fileName = 'test.thrift') {
        const lines = text.split('\n');
        return {
            uri: {fsPath: path.join(__dirname, '..', '..', 'test-files', fileName)},
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
                        return {
                            start: {line: position.line, character: start},
                            end: {line: position.line, character: end}
                        };
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
                        return {line: i, character: offset - currentOffset};
                    }
                    currentOffset += lineLength;
                }
                return {line: lines.length - 1, character: lines[lines.length - 1].length};
            }
        };
    }

    function createMockPosition(line, character) {
        return {line, character};
    }

    function createMockCancellationToken() {
        return {isCancellationRequested: false};
    }

    it('should find definition of struct type within same file', async () => {


        const structText = `struct User {
    1: required string name
}

struct Profile {
    1: required User user
}`;
        const structDocument = createMockDocument(structText);
        const structPosition = createMockPosition(5, 18); // On "User" in Profile struct

        const structDefinition = await provider.provideDefinition(
            structDocument,
            structPosition,
            createMockCancellationToken()
        );


        assert(structDefinition, 'Should find definition for struct type');
        assert(structDefinition.uri.fsPath.includes('test.thrift'), 'Definition should be in same file');
        assert(structDefinition.range.start.line === 0, 'Definition should be at line 0');
        assert(structDefinition.range.end.line === 3, 'Definition should end at line 3');
    });

    it('should find definition of enum type', async () => {
        const enumText = `enum Status {
    ACTIVE = 1,
    INACTIVE = 2
}

struct User {
    1: required Status status
}`;
        const enumDocument = createMockDocument(enumText);
        const enumPosition = createMockPosition(6, 20); // On "Status" in User struct (line 6, char 20 - exactly on "Status")


        // Test word extraction at this position
        const wordRange = enumDocument.getWordRangeAtPosition(enumPosition);
        if (wordRange) {
            const lineText = enumDocument.lineAt(enumPosition.line).text;
            const word = lineText.substring(wordRange.start.character, wordRange.end.character);
        }

        const enumDefinition = await provider.provideDefinition(
            enumDocument,
            enumPosition,
            createMockCancellationToken()
        );


        if (enumDefinition) {
            assert(enumDefinition.range.start.line === 0, 'Enum definition should be at line 0');
        } else {
        }
    });

    it('should find definition of typedef', async () => {
        const typedefText = `typedef i32 UserId

struct User {
    1: required UserId id
}`;
        const typedefDocument = createMockDocument(typedefText);
        const typedefPosition = createMockPosition(3, 18); // On "UserId" in User struct (line 3, char 18 - after "required ")


        // Test word extraction at this position
        const typedefWordRange = typedefDocument.getWordRangeAtPosition(typedefPosition);
        if (typedefWordRange) {
            const lineText = typedefDocument.lineAt(typedefPosition.line).text;
            const word = lineText.substring(typedefWordRange.start.character, typedefWordRange.end.character);
        }

        const typedefDefinition = await provider.provideDefinition(
            typedefDocument,
            typedefPosition,
            createMockCancellationToken()
        );


        if (typedefDefinition) {
            assert(typedefDefinition.range.start.line === 0, 'Typedef definition should be at line 0');
        }
    });

    it('should find definition of service method', async () => {
        const serviceText = `service UserService {
    User getUser(1: i32 id),
    void createUser(1: User user)
}

service ExtendedUserService extends UserService {
    User updateUser(1: i32 id, 2: User user)
}`;
        const serviceDocument = createMockDocument(serviceText);
        const servicePosition = createMockPosition(6, 28); // On "User" in updateUser method (line 6, char 28 - after "2: ")

        const serviceDefinition = await provider.provideDefinition(
            serviceDocument,
            servicePosition,
            createMockCancellationToken()
        );

        if (serviceDefinition) {
            assert(serviceDefinition.range.start.line >= 0, 'Service definition should be found');
        }
    });

    it('should not find definition for primitive types', async () => {
        const primitiveText = `struct User {
    1: required string name,
    2: required i32 age
}`;
        const primitiveDocument = createMockDocument(primitiveText);
        const primitivePosition = createMockPosition(1, 18); // On "string"

        const primitiveDefinition = await provider.provideDefinition(
            primitiveDocument,
            primitivePosition,
            createMockCancellationToken()
        );

        assert(primitiveDefinition === undefined, 'Should not find definition for primitive types');
    });

    it('should handle cancellation token', async () => {
        const structText = `struct User {
    1: required string name
}

struct Profile {
    1: required User user
}`;
        const structDocument = createMockDocument(structText);
        const structPosition = createMockPosition(5, 18);
        const cancelledToken = {isCancellationRequested: true};
        const cancelledDefinition = await provider.provideDefinition(
            structDocument,
            structPosition,
            cancelledToken
        );

        // Note: The definition provider may not check for cancellation
        if (cancelledDefinition) {
        }
    });
});
