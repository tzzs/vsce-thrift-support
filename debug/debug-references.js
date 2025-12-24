// Debug script for references provider
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

async function debugReferences() {
    console.log('=== Debugging References Provider ===\n');

    const provider = new ThriftReferencesProvider();

    // Test finding references to "User" type
    const text = `struct User {
  1: required i32 id
}

service UserService {
  User getUser(1: i32 userId),
  void createUser(1: User user)
}`;
    console.log('Document text:');
    console.log(text);
    console.log('');

    // Mock document with improved getWordRangeAtPosition
    const lines = text.split('\n');
    const document = {
        uri: {fsPath: path.join(__dirname, 'tests', 'test-files', 'test.thrift')},
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
            console.log(`Getting word range at position (${position.line}, ${position.character}) in line: "${lineText}"`);

            // 更精确地匹配单词边界
            const wordRegex = /\b([A-Za-z_][A-Za-z0-9_]*)\b/g;
            let match;
            while ((match = wordRegex.exec(lineText)) !== null) {
                console.log(`Found match: "${match[0]}" at index ${match.index}`);
                if (position.character >= match.index && position.character <= match.index + match[0].length) {
                    console.log(`Matched word: "${match[0]}"`);
                    return new mockVscode.Range(position.line, match.index, position.line, match.index + match[0].length);
                }
            }
            console.log('No word found at position');
            return null;
        }
    };

    const position = new mockVscode.Position(0, 7); // On "User" in struct definition
    console.log(`Position: line ${position.line}, character ${position.character}\n`);

    const wordRange = document.getWordRangeAtPosition(position);
    console.log('Word range:', wordRange);

    if (wordRange) {
        const symbolName = document.getText({
            start: {line: wordRange.start.line, character: wordRange.start.character},
            end: {line: wordRange.end.line, character: wordRange.end.character}
        });
        console.log(`Symbol name: "${symbolName}"\n`);
    }

    // Mock context and token
    const context = {includeDeclaration: true};
    const token = {isCancellationRequested: false};

    try {
        console.log('Calling provideReferences...');
        const references = await provider.provideReferences(document, position, context, token);
        console.log(`Found ${references.length} references`);
        console.log('References:', references);
    } catch (error) {
        console.error('Error in provideReferences:', error);
    }
}

debugReferences().catch(console.error);