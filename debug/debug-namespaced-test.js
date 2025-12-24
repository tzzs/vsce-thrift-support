const fs = require('fs');
const path = require('path');

// Setup vscode mock before loading any modules that depend on it
const mockVscode = require('./tests/mock-vscode.js');

const {Location, Range, Position} = mockVscode;

// Extend mockVscode with workspace mock
mockVscode.workspace = {
    findFiles: async (pattern, exclude) => {
        // Mock implementation - return test thrift files
        if (pattern.includes('*.thrift')) {
            return [
                {fsPath: path.join(__dirname, 'tests', 'test-files', 'main.thrift')},
                {fsPath: path.join(__dirname, 'tests', 'test-files', 'shared.thrift')}
            ];
        }
        return [];
    },
    textDocuments: [], // Add this to prevent "Cannot read properties of undefined (reading 'find')" error
    fs: {
        readFile: async (uri) => {
            // Read the actual test files
            const fs = require('fs');
            const content = fs.readFileSync(uri.fsPath, 'utf-8');
            return Buffer.from(content, 'utf-8');
        }
    },
    openTextDocument: async (uri) => {
        // Mock different file contents based on path
        const fileName = path.basename(uri.fsPath);
        let content = '';

        if (fileName === 'main.thrift') {
            content = `include "shared.thrift"

struct User {
  1: required i32 id,
  2: optional shared.Address address
}

service UserService {
  shared.Address getUserAddress(1: i32 userId)
}`;
        } else if (fileName === 'shared.thrift') {
            content = `namespace java com.example.shared

enum Priority {
  LOW = 1,
  MEDIUM = 2,
  HIGH = 3
}

struct Address {
  1: required string street,
  2: optional string city,
  3: optional string country
}

const string DEFAULT_COUNTRY = "USA"`;
        }

        return {
            getText: () => content,
            uri: uri,
            lineAt: (line) => ({text: content.split('\n')[line] || ''}),
            getWordRangeAtPosition: (position) => {
                const lines = content.split('\n');
                const lineText = lines[position.line] || '';
                const wordRegex = /[A-Za-z_][A-Za-z0-9_]*/g;
                let match;
                while ((match = wordRegex.exec(lineText)) !== null) {
                    if (position.character >= match.index && position.character <= match.index + match[0].length) {
                        return new mockVscode.Range(position.line, match.index, position.line, match.index + match[0].length);
                    }
                }
                return null;
            }
        };
    }
};

mockVscode.Uri = {
    file: (filePath) => ({
        fsPath: filePath,
        toString: () => `file://${filePath}`
    })
};

// Hook require('vscode') to return our mock
const Module = require('module');
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
    if (request === 'vscode') return mockVscode;
    return originalLoad.apply(this, arguments);
};

const {ThriftReferencesProvider} = require('./out/src/referencesProvider.js');

function createMockDocument(text, fileName = 'test.thrift', uri = null) {
    const lines = text.split('\n');
    return {
        uri: uri || {fsPath: path.join(__dirname, 'tests', 'test-files', fileName)},
        getText: (range) => {
            if (!range) return text;
            // Extract text within the specified range
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
            // 更精确地匹配单词边界
            const wordRegex = /\b([A-Za-z_][A-Za-z0-9_]*)\b/g;
            let match;
            while ((match = wordRegex.exec(lineText)) !== null) {
                if (position.character >= match.index && position.character <= match.index + match[0].length) {
                    return new mockVscode.Range(position.line, match.index, position.line, match.index + match[0].length);
                }
            }
            return null;
        }
    };
}

function createMockPosition(line, character) {
    return new mockVscode.Position(line, character);
}

function createMockCancellationToken() {
    return {isCancellationRequested: false};
}

function createMockReferenceContext() {
    return {includeDeclaration: true};
}

async function debugNamespacedReferences() {
    console.log('=== Debug Namespaced References ===');

    const provider = new ThriftReferencesProvider();

    // Test content with namespaced references
    const mainContent = `include "shared.thrift"

struct User {
  1: required i32 id,
  2: optional shared.Address address
}

service UserService {
  shared.Address getUserAddress(1: i32 userId)
}`;

    const document = createMockDocument(mainContent, 'main.thrift');

    // Test position on "Address" in field definition (should be line 4, character ~25)
    console.log('\n--- Test 1: Position on "Address" in field definition ---');
    const position1 = createMockPosition(4, 25); // On "Address" in field definition
    console.log(`Position: [${position1.line}, ${position1.character}]`);

    const lineText1 = document.lineAt(position1.line).text;
    console.log(`Line text: "${lineText1}"`);

    const wordRange1 = document.getWordRangeAtPosition(position1, /\b([A-Za-z_][A-Za-z0-9_]*)\b/);
    if (wordRange1) {
        const symbolName = document.getText(wordRange1);
        console.log(`Word at position: "${symbolName}"`);
        console.log(`Word range: [${wordRange1.start.line}, ${wordRange1.start.character}] to [${wordRange1.end.line}, ${wordRange1.end.character}]`);
    } else {
        console.log('No word found at position');
    }

    const references1 = await provider.provideReferences(
        document,
        position1,
        createMockReferenceContext(),
        createMockCancellationToken()
    );

    console.log(`Found ${references1.length} references`);

    // Test position on "Address" in service method return type
    console.log('\n--- Test 2: Position on "Address" in service method return type ---');
    const position2 = createMockPosition(7, 20); // On "Address" in service method
    console.log(`Position: [${position2.line}, ${position2.character}]`);

    const lineText2 = document.lineAt(position2.line).text;
    console.log(`Line text: "${lineText2}"`);

    const wordRange2 = document.getWordRangeAtPosition(position2, /\b([A-Za-z_][A-Za-z0-9_]*)\b/);
    if (wordRange2) {
        const symbolName = document.getText(wordRange2);
        console.log(`Word at position: "${symbolName}"`);
        console.log(`Word range: [${wordRange2.start.line}, ${wordRange2.start.character}] to [${wordRange2.end.line}, ${wordRange2.end.character}]`);
    } else {
        console.log('No word found at position');
    }

    const references2 = await provider.provideReferences(
        document,
        position2,
        createMockReferenceContext(),
        createMockCancellationToken()
    );

    console.log(`Found ${references2.length} references`);

    // Test position on "shared" in field definition
    console.log('\n--- Test 3: Position on "shared" in field definition ---');
    const position3 = createMockPosition(4, 18); // On "shared" in field definition
    console.log(`Position: [${position3.line}, ${position3.character}]`);

    const lineText3 = document.lineAt(position3.line).text;
    console.log(`Line text: "${lineText3}"`);

    const wordRange3 = document.getWordRangeAtPosition(position3, /\b([A-Za-z_][A-Za-z0-9_]*)\b/);
    if (wordRange3) {
        const symbolName = document.getText(wordRange3);
        console.log(`Word at position: "${symbolName}"`);
        console.log(`Word range: [${wordRange3.start.line}, ${wordRange3.start.character}] to [${wordRange3.end.line}, ${wordRange3.end.character}]`);
    } else {
        console.log('No word found at position');
    }

    const references3 = await provider.provideReferences(
        document,
        position3,
        createMockReferenceContext(),
        createMockCancellationToken()
    );

    console.log(`Found ${references3.length} references`);
}

debugNamespacedReferences().catch(console.error);