const fs = require('fs');
const path = require('path');

// Setup vscode mock before loading any modules that depend on it
const mockVscode = require('./tests/mock-vscode.js');

// Extend mockVscode with workspace mock
mockVscode.workspace = {
    textDocuments: [],
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
    fs: {
        readFile: async (uri) => {
            const fs = require('fs');
            const fsPath = uri.fsPath || uri.path || uri;
            console.log(`Reading file: ${fsPath}`);
            return fs.readFileSync(fsPath);
        }
    }
};

mockVscode.Uri = {
    file: (filePath) => {
        return {
            fsPath: filePath,
            path: filePath,
            toString: () => `file://${filePath}`
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

// Import the references provider
const {ThriftReferencesProvider} = require('./out/src/referencesProvider.js');

async function debugReferences() {
    console.log('=== Debugging References Provider ===\n');

    try {
        const provider = new ThriftReferencesProvider();

        // Read the main.thrift file content
        const mainFilePath = path.join(__dirname, 'tests', 'test-files', 'main.thrift');
        const mainFileContent = fs.readFileSync(mainFilePath, 'utf8');
        console.log(`Main file content:\n${mainFileContent}\n`);

        // Create a mock document
        const document = {
            uri: {fsPath: mainFilePath},
            getText: () => mainFileContent,
            getWordRangeAtPosition: (position) => {
                // Use the helper function correctly
                return mockVscode.getWordRangeAtPositionFromText(mainFileContent, position);
            }
        };

        // Position on "User" in struct definition (line 4, character 7)
        const position = new mockVscode.Position(4, 7);

        console.log(`Looking for references at position [${position.line}, ${position.character}]`);

        // Try to get word range
        const wordRange = document.getWordRangeAtPosition(position);
        if (wordRange) {
            const symbolName = mainFileContent.split('\n')[wordRange.start.line].substring(wordRange.start.character, wordRange.end.character);
            console.log(`Found symbol: "${symbolName}" at range [${wordRange.start.line}, ${wordRange.start.character}] to [${wordRange.end.line}, ${wordRange.end.character}]`);
        } else {
            console.log('No word range found');
            return;
        }

        // Mock context and token
        const context = {includeDeclaration: true};
        const token = {isCancellationRequested: false};

        // Call provideReferences
        console.log('\nCalling provideReferences...');
        const references = await provider.provideReferences(document, position, context, token);

        console.log(`\nFound ${references.length} references:`);
        references.forEach((ref, index) => {
            console.log(`${index + 1}. File: ${ref.uri.fsPath}, Range: [${ref.range.start.line}, ${ref.range.start.character}] to [${ref.range.end.line}, ${ref.range.end.character}]`);
        });

    } catch (error) {
        console.error('Error during debug:', error);
        console.error('Stack trace:', error.stack);
    }
}

debugReferences().catch(console.error);