const fs = require('fs');
const path = require('path');

// Simple mock for vscode dependencies
const mockVSCode = {
    Range: class {
        constructor(start, end) {
            this.start = start;
            this.end = end;
        }
    },
    Position: class {
        constructor(line, character) {
            this.line = line;
            this.character = character;
        }
    },
    workspace: {
        getConfiguration: (section) => {
            return {
                get: (key, defaultValue) => {
                    // Return default values for formatting options
                    const defaults = {
                        'alignAnnotations': true,
                        'alignStructAnnotations': true,
                        'alignNames': true,
                        'alignFieldNames': true,
                        'alignEnumNames': true,
                        'alignAssignments': true,
                        'alignStructDefaults': false,
                        'alignEnumEquals': true,
                        'alignEnumValues': true,
                        'alignTypes': true,
                        'alignComments': true,
                        'trailingComma': 'preserve',
                        'indentSize': 4,
                        'maxLineLength': 100,
                        'collectionStyle': 'preserve'
                    };
                    return defaults[key] !== undefined ? defaults[key] : defaultValue;
                }
            };
        }
    }
};

// Mock the vscode module
require.cache[require.resolve('vscode')] = {
    exports: mockVSCode
};

// Now require the formatting provider
const { ThriftFormattingProvider } = require('./out/formattingProvider');

// Read the test file
const testContent = fs.readFileSync('test-files/annotation-edge-cases.thrift', 'utf8');

// Create a mock document
const mockDocument = {
    getText: () => testContent,
    positionAt: (offset) => {
        const lines = testContent.substring(0, offset).split('\n');
        return new mockVSCode.Position(lines.length - 1, lines[lines.length - 1].length);
    }
};

// Create formatting options
const options = {
    insertSpaces: true,
    tabSize: 4
};

// Create the provider
const provider = new ThriftFormattingProvider();

// Format the document
const edits = provider.provideDocumentFormattingEdits(mockDocument, options, null);

if (edits && edits.length > 0) {
    // Apply the edit to get the formatted result
    const edit = edits[0];
    const formattedText = edit.newText;
    
    console.log('=== ORIGINAL ===');
    console.log(testContent);
    console.log('\n=== FORMATTED ===');
    console.log(formattedText);
    
    // Write both to files for comparison
    fs.writeFileSync('test-files/original.thrift', testContent);
    fs.writeFileSync('test-files/formatted.thrift', formattedText);
    
    console.log('\nFiles written to test-files/original.thrift and test-files/formatted.thrift');
} else {
    console.log('No formatting edits generated');
}