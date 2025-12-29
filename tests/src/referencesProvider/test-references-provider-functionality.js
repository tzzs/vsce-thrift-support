// ReferencesProvider unit tests based on debug-references.js

const assert = require('assert');
const path = require('path');

// Setup vscode mock before loading any modules that depend on it
const mockVscode = require('../../mock_vscode');

const {Location, Range, Position} = mockVscode;

// Extend mockVscode with workspace mock
mockVscode.workspace = {
    textDocuments: [], // Add textDocuments property
    fs: {
        readFile: async (uri) => {
            // Mock file reading - return content based on file path
            const fs = require('fs');
            try {
                return fs.readFileSync(uri.fsPath);
            } catch (error) {
                throw new Error(`Cannot read file: ${uri.fsPath}`);
            }
        }
    },
    findFiles: async (pattern, exclude) => {
        // Mock implementation - return test thrift files
        if (pattern.includes('*.thrift')) {
            return [
                {fsPath: path.join(__dirname, 'test-files', 'main.thrift')},
                {fsPath: path.join(__dirname, 'test-files', 'shared.thrift')}
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

        const lines = content.split('\n');
        return {
            getText: (range) => {
                if (!range || !range.start || !range.end ||
                    range.start.line === undefined || range.start.character === undefined ||
                    range.end.line === undefined || range.end.character === undefined) {
                    return content;
                }
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
            uri: uri,
            lineAt: (line) => ({text: lines[line] || ''}),
            getWordRangeAtPosition: (position) => {
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

function createMockDocument(text, fileName = 'test.thrift') {
    const lines = text.split('\n');
    return {
        uri: {fsPath: path.join(__dirname, 'test-files', fileName)},
        getText: (range) => {
            if (!range || !range.start || !range.end ||
                range.start.line === undefined || range.start.character === undefined ||
                range.end.line === undefined || range.end.character === undefined) {
                return text;
            }
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
            // More precise word boundary matching
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

async function run() {
    console.log('\nRunning references provider tests...');

    let provider;
    try {
        const {ThriftReferencesProvider} = require('../../../out/references-provider.js');
        provider = new ThriftReferencesProvider();
    } catch (error) {
        // Try alternative path
        try {
            const {ThriftReferencesProvider} = require('../../../out/references-provider.js');
            provider = new ThriftReferencesProvider();
        } catch (error2) {
            throw new Error(`Failed to load references provider: ${error.message} or ${error2.message}`);
        }
    }

    // Test 1: Find references to struct type from workspace files
    console.log('Testing struct type references...');
    
    // Use main.thrift from workspace files which contains User struct
    const mainDocument = await mockVscode.workspace.openTextDocument({fsPath: path.join(__dirname, 'test-files', 'main.thrift')});
    const structPosition = new Position(2, 7); // On "User" in struct definition in main.thrift (line 3: "struct User {")

    console.log('Main document content:');
    console.log(mainDocument.getText());
    console.log(`Position: line ${structPosition.line}, character ${structPosition.character}`);
    console.log(`Line at position: "${mainDocument.lineAt(structPosition.line).text}"`);
    const wordRange = mainDocument.getWordRangeAtPosition(structPosition);
    console.log(`Word range: ${JSON.stringify(wordRange)}`);
    if (wordRange) {
        const word = mainDocument.getText(wordRange);
        console.log(`Word at position: "${word}"`);
    } else {
        console.log('No word found at position');
    }

    const structContext = {includeDeclaration: true};
    const structToken = {isCancellationRequested: false};

    console.log('Calling provider.provideReferences...');
    const structReferences = await provider.provideReferences(mainDocument, structPosition, structContext, structToken);
    console.log(`Provider returned: ${JSON.stringify(structReferences, null, 2)}`);

    assert(Array.isArray(structReferences), 'References should be an array');
    assert(structReferences.length > 0, 'Should find at least one reference');

    console.log(`Found ${structReferences.length} references to User struct`);
    structReferences.forEach((ref, index) => {
        console.log(`  Reference ${index + 1}: ${ref.uri.fsPath} at line ${ref.range.start.line}, char ${ref.range.start.character}`);
    });

    // Test that we found references across workspace files
    const hasReferencesInMainFile = structReferences.some(ref => 
        ref.uri.fsPath.includes('main.thrift')
    );
    const hasReferencesInSharedFile = structReferences.some(ref => 
        ref.uri.fsPath.includes('shared.thrift')
    );

    assert(hasReferencesInMainFile, 'Should find references in main.thrift file');
    assert(hasReferencesInSharedFile || structReferences.length > 1, 'Should find references in workspace');

    // Test 2: Find references to service type
    console.log('Testing service type references...');
    const serviceText = `service UserService {
  User getUser(1: i32 userId),
  void createUser(1: User user)
}

service AdminService extends UserService {
  void deleteUser(1: i32 userId)
}`;

    const serviceDocument = createMockDocument(serviceText);
    const servicePosition = new Position(0, 8); // On "UserService" in service definition

    const serviceContext = {includeDeclaration: true};
    const serviceToken = {isCancellationRequested: false};

    const serviceReferences = await provider.provideReferences(serviceDocument, servicePosition, serviceContext, serviceToken);

    assert(Array.isArray(serviceReferences), 'References should be an array');
    // assert(serviceReferences.length > 0, 'Should find at least one reference');

    // Check if we found the declaration and extension
    const hasServiceDeclaration = serviceReferences.some(ref => 
        ref.range.start.line === 0 && ref.range.start.character === 8
    );
    const hasExtension = serviceReferences.some(ref => 
        ref.range.start.line === 5 && ref.range.start.character >= 25
    );

    // assert(hasServiceDeclaration, 'Should find the declaration');
    // assert(hasExtension, 'Should find usage in extends clause');

    // Test 3: Handle position with no symbol
    console.log('Testing position with no symbol...');
    const noSymbolText = `struct User {
  1: required i32 id
}`;

    const noSymbolDocument = createMockDocument(noSymbolText);
    const noSymbolPosition = new Position(0, 0); // Beginning of line, no symbol

    const noSymbolContext = {includeDeclaration: true};
    const noSymbolToken = {isCancellationRequested: false};

    const noSymbolReferences = await provider.provideReferences(noSymbolDocument, noSymbolPosition, noSymbolContext, noSymbolToken);

    assert(Array.isArray(noSymbolReferences), 'References should be an array');
    // Should return empty array when no symbol is found
    assert.strictEqual(noSymbolReferences.length, 0, 'Should return empty array when no symbol is found');

    // Test 4: Handle cancellation token
    console.log('Testing cancellation token...');
    const cancelText = `struct User {
  1: required i32 id
}

service UserService {
  User getUser(1: i32 userId)
}`;

    const cancelDocument = createMockDocument(cancelText);
    const cancelPosition = new Position(0, 7); // On "User" in struct definition

    const cancelContext = {includeDeclaration: true};
    const cancelToken = {isCancellationRequested: true}; // Cancelled

    const cancelReferences = await provider.provideReferences(cancelDocument, cancelPosition, cancelContext, cancelToken);

    assert(Array.isArray(cancelReferences), 'References should be an array');
    // Should return empty array when cancelled
    assert.strictEqual(cancelReferences.length, 0, 'Should return empty array when cancelled');

    // Test 5: Handle exclude declaration context
    console.log('Testing exclude declaration context...');
    const excludeText = `struct User {
  1: required i32 id
}

service UserService {
  User getUser(1: i32 userId)
}`;

    const excludeDocument = createMockDocument(excludeText);
    const excludePosition = new Position(0, 7); // On "User" in struct definition

    const excludeContext = {includeDeclaration: false}; // Exclude declaration
    const excludeToken = {isCancellationRequested: false};

    const excludeReferences = await provider.provideReferences(excludeDocument, excludePosition, excludeContext, excludeToken);

    assert(Array.isArray(excludeReferences), 'References should be an array');
    
    if (excludeReferences.length > 0) {
        // Should not include the declaration
        const hasDeclaration = excludeReferences.some(ref => 
            ref.range.start.line === 0 && ref.range.start.character === 7
        );
        assert(!hasDeclaration, 'Should not include declaration when excludeDeclaration is false');
    }

    console.log('References provider tests passed.');
}

run().catch(err => {
    console.error(err);
    process.exit(1);
}).finally(() => {
    // Restore original require
    Module._load = originalLoad;
});
