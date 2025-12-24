const path = require('path');

// Mock VSCode API
const mockVscode = {
    workspace: {
        textDocuments: [],
        findFiles: async function(pattern, exclude) {
            console.log('Mock findFiles called with pattern:', pattern);
            return [];
        },
        fs: {
            readFile: async function(uri) {
                throw new Error('File not found');
            }
        }
    },
    Uri: {
        file: function(path) {
            return { fsPath: path, toString: () => path };
        }
    },
    Location: class {
        constructor(uri, range) {
            this.uri = uri;
            this.range = range;
        }
    },
    Range: class {
        constructor(startLine, startChar, endLine, endChar) {
            this.start = { line: startLine, character: startChar };
            this.end = { line: endLine, character: endChar };
        }
    },
    Position: class {
        constructor(line, character) {
            this.line = line;
            this.character = character;
        }
        toString() {
            return `${this.line}:${this.character}`;
        }
    }
};

// Mock VSCode API
const Module = require('module');
const originalRequire = Module.prototype.require;
Module.prototype.require = function(id) {
    if (id === 'vscode') {
        return mockVscode;
    }
    return originalRequire.apply(this, arguments);
};

// Load the definition provider
const { ThriftDefinitionProvider } = require('../out/src/definitionProvider');

async function debugDefinitionProvider() {
    console.log('Debugging definition provider...');
    
    const provider = new ThriftDefinitionProvider();
    
    const testText = `struct UniqueStruct123 {
    1: required string name
}`;
    
    const testUri = mockVscode.Uri.file('test://document.thrift');
    
    console.log('Testing findDefinitionInDocument...');
    console.log('Text:', testText);
    console.log('URI:', testUri.fsPath);
    console.log('Type name: UniqueStruct123');
    
    const result = await provider.findDefinitionInDocument(testUri, testText, 'UniqueStruct123');
    console.log('findDefinitionInDocument Result:', JSON.stringify(result, null, 2));
    
    // Now test the full provideDefinition method
    console.log('\nTesting full provideDefinition method...');
    
    // Create a mock document
    const mockDocument = {
        uri: testUri,
        getText: () => testText,
        lineAt: function(line) {
            const lines = testText.split('\n');
            return { text: lines[line] || '' };
        },
        getWordRangeAtPosition: function(position) {
            // Simple word extraction
            const lineText = this.lineAt(position.line).text;
            const wordRegex = /[a-zA-Z_][a-zA-Z0-9_]*/g;
            let match;
            while ((match = wordRegex.exec(lineText)) !== null) {
                const start = match.index;
                const end = start + match[0].length;
                if (position.character >= start && position.character <= end) {
                    return new mockVscode.Range(position.line, start, position.line, end);
                }
            }
            return null;
        }
    };
    
    const position = new mockVscode.Position(0, 7); // On "UniqueStruct123"
    console.log('Position:', position.toString());
    console.log('Line text:', mockDocument.lineAt(position.line).text);
    
    const fullResult = await provider.provideDefinition(mockDocument, position, { isCancellationRequested: false });
    console.log('Full provideDefinition Result:', JSON.stringify(fullResult, null, 2));
}

debugDefinitionProvider().catch(console.error);