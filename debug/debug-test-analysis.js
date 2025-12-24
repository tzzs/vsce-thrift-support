const fs = require('fs');
const path = require('path');

// Setup vscode mock before loading any modules that depend on it
const mockVscode = {
    Position: class Position {
        constructor(line, character) {
            this.line = line;
            this.character = character;
        }
    },
    Range: class Range {
        constructor(startLine, startChar, endLine, endChar) {
            this.start = new mockVscode.Position(startLine, startChar);
            this.end = new mockVscode.Position(endLine, endChar);
        }

        contains(position) {
            // Simplified contains implementation
            return position.line >= this.start.line && position.line <= this.end.line;
        }
    },
    Location: class Location {
        constructor(uri, range) {
            this.uri = uri;
            this.range = range;
        }
    },
    Uri: class Uri {
        constructor(scheme, authority, path, query, fragment) {
            this.scheme = scheme;
            this.authority = authority;
            this.path = path;
            this.query = query;
            this.fragment = fragment;
            this.fsPath = path;
        }

        static file(filePath) {
            return new mockVscode.Uri('file', '', filePath, '', '');
        }
    }
};

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
    textDocuments: [],
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

        if (fileName === 'test.thrift') {
            content = `struct User {
  1: required i32 id
}

service UserService {
  User getUser(1: i32 userId),
  void createUser(1: User user)
}`;
        } else if (fileName === 'main.thrift') {
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
};

// Hook require('vscode') to return our mock
const Module = require('module');
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
    if (request === 'vscode') return mockVscode;
    return originalLoad.apply(this, arguments);
};

// Compile the TypeScript files first
const {execSync} = require('child_process');
try {
    console.log('Compiling TypeScript files...');
    execSync('npm run compile', {stdio: 'inherit'});
    console.log('Compilation successful!');
} catch (error) {
    console.error('Compilation failed:', error.message);
    process.exit(1);
}

// Now load the references provider
const {ThriftReferencesProvider} = require('./out/src/referencesProvider.js');

function getWordRangeAtPosition(text, position) {
    const lines = text.split('\n');
    const lineText = lines[position.line] || '';
    const wordRegex = /\b([A-Za-z_][A-Za-z0-9_]*)\b/g;
    let match;
    while ((match = wordRegex.exec(lineText)) !== null) {
        if (position.character >= match.index && position.character <= match.index + match[0].length) {
            return {
                start: {line: position.line, character: match.index},
                end: {line: position.line, character: match.index + match[0].length}
            };
        }
    }
    return null;
}

async function debugUserReferences() {
    console.log('=== Debugging User Type References ===');

    const provider = new ThriftReferencesProvider();

    // Create mock document for test.thrift (as in the test)
    const testContent = `struct User {
  1: required i32 id
}

service UserService {
  User getUser(1: i32 userId),
  void createUser(1: User user)
}`;

    console.log('Test.thrift content:');
    console.log(testContent);
    console.log('---');

    const testDocument = {
        uri: {fsPath: path.join(__dirname, 'tests', 'test-files', 'test.thrift')},
        getText: (range) => {
            if (!range) return testContent;
            const lines = testContent.split('\n');
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
        lineAt: (line) => ({text: testContent.split('\n')[line] || ''}),
        getWordRangeAtPosition: (position) => {
            return getWordRangeAtPosition(testContent, position);
        }
    };

    // Position on "User" in struct definition (line 0, character 7)
    const position = new mockVscode.Position(0, 7);
    console.log(`Position: [${position.line}, ${position.character}]`);

    // Get the word at position
    const wordRange = testDocument.getWordRangeAtPosition(position);
    if (wordRange) {
        const symbolName = testContent.split('\n')[wordRange.start.line].substring(wordRange.start.character, wordRange.end.character);
        console.log(`Symbol name at position: "${symbolName}"`);
    } else {
        console.log('No word found at position');
        return;
    }

    // Mock context and token
    const context = {includeDeclaration: true};
    const token = {isCancellationRequested: false};

    try {
        console.log('Calling provideReferences...');
        const references = await provider.provideReferences(testDocument, position, context, token);
        console.log(`Found ${references.length} references to User type:`);

        references.forEach((ref, index) => {
            console.log(`  ${index + 1}. File: ${ref.uri.fsPath}, Line: ${ref.range.start.line}, Char: ${ref.range.start.character}`);
        });
    } catch (error) {
        console.error('Error finding references:', error);
    }
}

// Run the debug function
debugUserReferences().catch(console.error);