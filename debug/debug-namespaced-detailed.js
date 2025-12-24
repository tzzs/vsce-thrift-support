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
  2: optional string name,
  3: optional shared.Address address,
  4: required shared.Priority priority = shared.Priority.LOW
}

service UserManagementService {
  User createUser(1: User user),
  void updateUser(1: i32 userId, 2: User user),
  shared.Address getAddress(1: i32 userId)
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
    file: (filePath) => ({fsPath: filePath})
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
    console.log('=== Debugging Namespaced References ===\n');

    const provider = new ThriftReferencesProvider();

    // Test finding references to namespaced types
    const mainContent = `include "shared.thrift"

struct User {
  1: required i32 id,
  2: optional string name,
  3: optional shared.Address address,
  4: required shared.Priority priority = shared.Priority.LOW
}

service UserManagementService {
  User createUser(1: User user),
  void updateUser(1: i32 userId, 2: User user),
  shared.Address getAddress(1: i32 userId)
}`;
    const document = createMockDocument(mainContent, 'main.thrift');

    console.log('Document content:');
    console.log(mainContent);
    console.log('\n---\n');

    // Test 1: Position on "Address" in "shared.Address" in field definition
    console.log('Test 1: Position on "Address" in field definition');
    // Line 5 (0-indexed), character ~27 where "Address" starts in "optional shared.Address address"
    const position1 = createMockPosition(4, 27); // On "Address" in field definition
    console.log(`Position: [${position1.line}, ${position1.character}]`);

    // Get the word at this position
    const wordRange1 = document.getWordRangeAtPosition(position1);
    if (wordRange1) {
        const word1 = mainContent.split('\n')[wordRange1.start.line].substring(wordRange1.start.character, wordRange1.end.character);
        console.log(`Word at position: "${word1}"`);
    }

    const references1 = await provider.provideReferences(
        document,
        position1,
        createMockReferenceContext(),
        createMockCancellationToken()
    );

    console.log(`Found ${references1.length} references to Address type\n`);

    // Test 2: Position on "Address" in service method return type
    console.log('Test 2: Position on "Address" in service method return type');
    // Line 13 (0-indexed), character ~17 where "Address" starts in "shared.Address getAddress"
    const position2 = createMockPosition(12, 17); // On "Address" in getAddress method
    console.log(`Position: [${position2.line}, ${position2.character}]`);

    // Get the word at this position
    const wordRange2 = document.getWordRangeAtPosition(position2);
    if (wordRange2) {
        const word2 = mainContent.split('\n')[wordRange2.start.line].substring(wordRange2.start.character, wordRange2.end.character);
        console.log(`Word at position: "${word2}"`);
    }

    const references2 = await provider.provideReferences(
        document,
        position2,
        createMockReferenceContext(),
        createMockCancellationToken()
    );

    console.log(`Found ${references2.length} references to Address type\n`);

    // Test 3: Position on "Priority" in field definition
    console.log('Test 3: Position on "Priority" in field definition');
    // Line 6 (0-indexed), character ~27 where "Priority" starts in "required shared.Priority priority"
    const position3 = createMockPosition(5, 27); // On "Priority" in field definition
    console.log(`Position: [${position3.line}, ${position3.character}]`);

    // Get the word at this position
    const wordRange3 = document.getWordRangeAtPosition(position3);
    if (wordRange3) {
        const word3 = mainContent.split('\n')[wordRange3.start.line].substring(wordRange3.start.character, wordRange3.end.character);
        console.log(`Word at position: "${word3}"`);
    }

    const references3 = await provider.provideReferences(
        document,
        position3,
        createMockReferenceContext(),
        createMockCancellationToken()
    );

    console.log(`Found ${references3.length} references to Priority type\n`);

    // Test 4: Position on "shared" in field definition
    console.log('Test 4: Position on "shared" in field definition');
    // Line 5 (0-indexed), character ~18 where "shared" starts in "optional shared.Address address"
    const position4 = createMockPosition(4, 18); // On "shared" in field definition
    console.log(`Position: [${position4.line}, ${position4.character}]`);

    // Get the word at this position
    const wordRange4 = document.getWordRangeAtPosition(position4);
    if (wordRange4) {
        const word4 = mainContent.split('\n')[wordRange4.start.line].substring(wordRange4.start.character, wordRange4.end.character);
        console.log(`Word at position: "${word4}"`);
    }

    const references4 = await provider.provideReferences(
        document,
        position4,
        createMockReferenceContext(),
        createMockCancellationToken()
    );

    console.log(`Found ${references4.length} references to shared namespace\n`);
}

debugNamespacedReferences().catch((error) => {
    console.error('Debug execution failed:', error);
    process.exit(1);
});