const fs = require('fs');
const path = require('path');

// Read the compiled formatting provider
const formattingProviderCode = fs.readFileSync('./out/formattingProvider.js', 'utf8');
const annotationParserCode = fs.readFileSync('./out/annotationParser.js', 'utf8');

// Create a simple test function that directly calls the formatting logic
const testFormatting = `
// Mock vscode dependencies
const vscode = {
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

// Load the modules
${annotationParserCode}
${formattingProviderCode}

// Test the formatting
const testContent = \`${fs.readFileSync('test-files/annotation-edge-cases.thrift', 'utf8')}\`;

const mockDocument = {
    getText: () => testContent,
    positionAt: (offset) => {
        const lines = testContent.substring(0, offset).split('\\n');
        return new vscode.Position(lines.length - 1, lines[lines.length - 1].length);
    }
};

const options = {
    insertSpaces: true,
    tabSize: 4
};

const provider = new exports.ThriftFormattingProvider();
const edits = provider.provideDocumentFormattingEdits(mockDocument, options, null);

if (edits && edits.length > 0) {
    const edit = edits[0];
    const formattedText = edit.newText;
    
    console.log('=== ORIGINAL ===');
    console.log(testContent);
    console.log('\\n=== FORMATTED ===');
    console.log(formattedText);
    
    require('fs').writeFileSync('test-files/original.thrift', testContent);
    require('fs').writeFileSync('test-files/formatted.thrift', formattedText);
    
    console.log('\\nFiles written to test-files/original.thrift and test-files/formatted.thrift');
} else {
    console.log('No formatting edits generated');
}
`;

// Write and execute the test
eval(testFormatting);