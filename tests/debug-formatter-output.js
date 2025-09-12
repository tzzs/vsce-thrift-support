const Module = require('module');
const path = require('path');

// Mock VSCode API
const vscode = {
    TextDocument: class {
        constructor(uri, text) {
            this.uri = uri;
            this._text = text;
            this._lines = text.split('\n');
        }
        
        getText(range) {
            if (!range) return this._text;
            return this._text;
        }
        
        lineAt(line) {
            return {
                text: this._lines[line] || '',
                range: new vscode.Range(line, 0, line, (this._lines[line] || '').length)
            };
        }
        
        get lineCount() {
            return this._lines.length;
        }
        
        positionAt(offset) {
            let currentOffset = 0;
            for (let line = 0; line < this._lines.length; line++) {
                const lineLength = this._lines[line].length + 1; // +1 for newline
                if (currentOffset + lineLength > offset) {
                    return new vscode.Position(line, offset - currentOffset);
                }
                currentOffset += lineLength;
            }
            return new vscode.Position(this._lines.length - 1, this._lines[this._lines.length - 1].length);
        }
        
        offsetAt(position) {
            let offset = 0;
            for (let i = 0; i < position.line && i < this._lines.length; i++) {
                offset += this._lines[i].length + 1; // +1 for newline
            }
            return offset + Math.min(position.character, this._lines[position.line]?.length || 0);
        }
    },
    
    Position: class {
        constructor(line, character) {
            this.line = line;
            this.character = character;
        }
    },
    
    Range: class {
        constructor(startLine, startChar, endLine, endChar) {
            this.start = new vscode.Position(startLine, startChar);
            this.end = new vscode.Position(endLine, endChar);
        }
    },
    
    TextEdit: class {
        constructor(range, newText) {
            this.range = range;
            this.newText = newText;
        }
        
        static replace(range, newText) {
            return new vscode.TextEdit(range, newText);
        }
    },
    
    Uri: {
        file: (path) => ({ fsPath: path, path })
    },
    
    workspace: {
        getConfiguration: (section) => ({
            get: (key, defaultValue) => {
                // Return default formatting options
                const config = {
                    'thrift-support.formatting.alignTypes': true,
                    'thrift-support.formatting.alignFieldNames': true,
                    'thrift-support.formatting.alignComments': false,
                    'thrift-support.formatting.trailingComma': 'preserve'
                };
                const fullKey = section ? `${section}.${key}` : key;
                return config[fullKey] !== undefined ? config[fullKey] : defaultValue;
            }
        })
    }
};

// Intercept require calls for 'vscode'
const originalRequire = Module.prototype.require;
Module.prototype.require = function(id) {
    if (id === 'vscode') {
        return vscode;
    }
    return originalRequire.apply(this, arguments);
};

function debugFormatterOutput() {
    console.log('Testing formatter output...');
    
    try {
        const { ThriftFormattingProvider } = require('../out/formatter.js');
        const formatter = new ThriftFormattingProvider();
        
        const testCode = `struct TestStruct {
    1: required list < string > names,
    2: optional map< string , i32 > values  ,
    3: i32 count
}`;
        
        console.log('Input code:');
        console.log(testCode);
        console.log();
        
        const document = new vscode.TextDocument(
            vscode.Uri.file('/test/format.thrift'),
            testCode
        );
        
        const options = { 
            insertSpaces: true, 
            tabSize: 4,
            alignTypes: true,
            alignFieldNames: true,
            alignComments: false,
            trailingComma: 'preserve'
        };
        
        console.log('Calling provideDocumentFormattingEdits...');
        const edits = formatter.provideDocumentFormattingEdits(document, options);
        
        console.log('Edits returned:', edits);
        console.log('Number of edits:', edits ? edits.length : 0);
        
        if (edits && edits.length > 0) {
            edits.forEach((edit, index) => {
                console.log(`Edit ${index + 1}:`);
                console.log('Range:', edit.range);
                console.log('New text:');
                console.log(edit.newText);
                console.log('---');
            });
            
            const formattedText = edits[0].newText;
            
            // Check if complex types are properly formatted
            console.log('Checking formatting:');
            console.log('- Contains list<string>:', formattedText.includes('list<string>'));
            console.log('- Contains map<string,i32>:', formattedText.includes('map<string,i32>'));
            
            if (formattedText.includes('list<string>') && formattedText.includes('map<string,i32>')) {
                console.log('✓ Complex types formatted correctly');
            } else {
                console.log('✗ Complex types not formatted correctly');
            }
        } else {
            console.log('✗ No edits returned');
        }
    } catch (error) {
        console.log('✗ Debug test failed:', error.message);
        console.log('Stack:', error.stack);
    }
}

debugFormatterOutput();