const Module = require('module');

// Mock VSCode API
const vscode = {
    TextDocument: class {
        constructor(uri, text) {
            this.uri = uri;
            this._text = text;
        }
        
        getText(range) {
            if (!range) return this._text;
            return this._text;
        }
        
        positionAt(offset) {
            return { line: 0, character: offset };
        }
        
        offsetAt(position) {
            return 0;
        }
    },
    
    Range: class {
        constructor(start, end) {
            this.start = start;
            this.end = end;
        }
    },
    
    TextEdit: {
        replace: (range, newText) => ({ range, newText })
    },
    
    workspace: {
        getConfiguration: () => ({
            get: (key, defaultValue) => {
                const configs = {
                    'trailingComma': 'preserve',
                    'alignTypes': true,
                    'alignFieldNames': false,
                    'alignComments': true,
                    'indentSize': 4,
                    'maxLineLength': 100
                };
                return configs[key] !== undefined ? configs[key] : defaultValue;
            }
        })
    }
};

// Mock require for vscode module
const originalRequire = Module.prototype.require;
Module.prototype.require = function(id) {
    if (id === 'vscode') {
        return vscode;
    }
    return originalRequire.apply(this, arguments);
};

// Test simple formatting
function testSimpleFormatting() {
    console.log('Testing simple formatting...');
    
    try {
        const { ThriftFormattingProvider } = require('../out/formattingProvider.js');
        const formatter = new ThriftFormattingProvider();
        
        const testCode = `struct TestStruct {
    1: required string name,
    2: optional i32 value
}`;
        
        console.log('Input code:');
        console.log(testCode);
        
        const document = new vscode.TextDocument(
            { fsPath: '/test/format.thrift' },
            testCode
        );
        
        const options = { insertSpaces: true, tabSize: 4 };
        const edits = formatter.provideDocumentFormattingEdits(document, options);
        
        if (edits && edits.length > 0) {
            const formattedText = edits[0].newText;
            console.log('\nFormatted code:');
            console.log(`"${formattedText}"`);
            
            if (formattedText && formattedText.trim().length > 0) {
                console.log('✓ Formatting works');
            } else {
                console.log('✗ Formatting returned empty result');
            }
        } else {
            console.log('✗ Formatting failed - no edits returned');
        }
    } catch (error) {
        console.log('✗ Formatting test failed:', error.message);
        console.log(error.stack);
    }
}

testSimpleFormatting();
