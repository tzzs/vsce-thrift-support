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
    openTextDocument: async (uri) => {
        // Mock different file contents based on path
        const fileName = path.basename(uri.fsPath);
        let content = '';

        if (fileName === 'main.thrift') {
            content = `include "shared.thrift"

struct User {
  1: required i32 id,
  2: optional string name,
  3: required Status status
}

service UserService {
  User getUser(1: i32 userId),
  void createUser(1: User user),
  Status getUserStatus(1: i32 userId)
}`;
        } else if (fileName === 'shared.thrift') {
            content = `namespace java com.example.shared

enum Status {
  ACTIVE = 1,
  INACTIVE = 2,
  PENDING = 3
}

const i32 MAX_USERS = 1000`;
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
    file: (filePath) => new mockVscode.Uri('file', '', filePath, '', '')
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
            console.log(`[DEBUG] getWordRangeAtPosition called with position: [${position.line}, ${position.character}]`);
            const lineText = lines[position.line] || '';
            console.log(`[DEBUG] Line text: "${lineText}"`);

            // 使用更精确的单词边界匹配
            const wordRegex = /\b([A-Za-z_][A-Za-z0-9_]*)\b/g;
            let match;
            while ((match = wordRegex.exec(lineText)) !== null) {
                console.log(`[DEBUG] Found match: "${match[0]}" at index ${match.index}`);
                if (position.character >= match.index && position.character <= match.index + match[0].length) {
                    console.log(`[DEBUG] Match found at position: [${position.line}, ${match.index}] to [${position.line}, ${match.index + match[0].length}]`);
                    return new mockVscode.Range(position.line, match.index, position.line, match.index + match[0].length);
                }
            }
            console.log(`[DEBUG] No match found`);
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

async function debugSymbolExtraction() {
    console.log('=== Debugging Symbol Extraction ===\n');

    const provider = new ThriftReferencesProvider();

    // Test finding references to "User" type
    const text = `struct User {
  1: required i32 id
}

service UserService {
  User getUser(1: i32 userId),
  void createUser(1: User user)
}`;
    console.log(`Test text:\n${text}\n`);

    const document = createMockDocument(text, 'test.thrift');
    const position = createMockPosition(0, 7); // On "User" in struct definition

    console.log(`Position: [${position.line}, ${position.character}]`);

    // Test word range extraction
    const wordRange = document.getWordRangeAtPosition(position);
    console.log(`Word range: ${wordRange ? `[${wordRange.start.line}, ${wordRange.start.character}] to [${wordRange.end.line}, ${wordRange.end.character}]` : 'null'}`);

    if (wordRange) {
        const symbolName = document.getText().substring(
            wordRange.start.line === 0 ? wordRange.start.character : 0,
            wordRange.end.line === 0 ? wordRange.end.character : document.getText().length
        );
        console.log(`Extracted symbol name (incorrect method): "${symbolName}"`);

        // Correct way to extract text from range
        const lines = document.getText().split('\n');
        const startLine = wordRange.start.line;
        const endLine = wordRange.end.line;
        const startChar = wordRange.start.character;
        const endChar = wordRange.end.character;

        if (startLine === endLine) {
            const extracted = lines[startLine].substring(startChar, endChar);
            console.log(`Correctly extracted symbol name: "${extracted}"`);
        }
    }

    try {
        console.log('\n--- Calling provideReferences ---');
        const references = await provider.provideReferences(
            document,
            position,
            createMockReferenceContext(),
            createMockCancellationToken()
        );

        console.log(`Found ${references.length} references`);
        console.log('References:', references);
    } catch (error) {
        console.error('Error occurred:', error);
        console.error('Error stack:', error.stack);
    }
}

debugSymbolExtraction().catch((error) => {
    console.error('Debug execution failed:', error);
});