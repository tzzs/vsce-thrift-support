const fs = require('fs');

// Read the compiled modules
const annotationParserCode = fs.readFileSync('./out/annotationParser.js', 'utf8');
const formattingProviderCode = fs.readFileSync('./out/formattingProvider.js', 'utf8');

// Create a test script that works with the compiled code
const testScript = `
// Mock vscode module
const Module = require('module');
const originalRequire = Module.prototype.require;

Module.prototype.require = function(id) {
    if (id === 'vscode') {
        return {
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
    }
    return originalRequire.apply(this, arguments);
};

// Load the compiled modules
${annotationParserCode}
${formattingProviderCode}

// Test the formatting
const testContent = \`${fs.readFileSync('test-files/annotation-edge-cases.thrift', 'utf8')}\`;

const mockDocument = {
    getText: () => testContent,
    positionAt: (offset) => {
        const lines = testContent.substring(0, offset).split('\\n');
        return new module.exports.Position(lines.length - 1, lines[lines.length - 1].length);
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

// Execute the test script
eval(testScript);