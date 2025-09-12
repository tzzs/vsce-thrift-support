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
        
        getWordRangeAtPosition(position) {
            const line = this._lines[position.line];
            if (!line) return null;
            
            // Find word boundaries
            let start = position.character;
            let end = position.character;
            
            // Move start backwards to find word start
            while (start > 0 && /\w/.test(line[start - 1])) {
                start--;
            }
            
            // Move end forwards to find word end  
            while (end < line.length && /\w/.test(line[end])) {
                end++;
            }
            
            if (start === end) return null;
            
            return new vscode.Range(
                new vscode.Position(position.line, start),
                new vscode.Position(position.line, end)
            );
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
    
    Location: class {
        constructor(uri, position) {
            this.uri = uri;
            this.range = new vscode.Range(position.line, position.character, position.line, position.character);
        }
    },
    
    Uri: {
        file: (path) => ({ fsPath: path, toString: () => `file://${path}` })
    },
    
    TextEdit: {
        replace: (range, newText) => ({ range, newText })
    },
    
    workspace: {
        fs: {
            stat: async (uri) => {
                // Mock file existence check
                if (uri.fsPath.includes('shared.thrift')) {
                    return { type: 1 }; // File exists
                }
                throw new Error('File not found');
            },
            
            readFile: async (uri) => {
                // Mock file reading
                if (uri.fsPath.includes('shared.thrift')) {
                    return Buffer.from('struct SharedStruct { 1: string name }');
                }
                throw new Error('File not found');
            }
        },
        
        findFiles: async (pattern) => {
            // Mock findFiles - return empty array for simplicity
            return [];
        },
        
        openTextDocument: async (uri) => {
            // Mock openTextDocument
            return new vscode.TextDocument(uri, 'struct MockStruct { 1: string name }');
        },
        
        getConfiguration: (section) => ({
            get: (key, defaultValue) => {
                // Return default formatting options
                const config = {
                    'thrift-support.formatting.alignTypes': true,
                    'thrift-support.formatting.alignFieldNames': true,
                    'thrift-support.formatting.alignComments': false,
                    'thrift-support.formatting.trailingComma': 'preserve',
                    'trailingComma': 'preserve',
                    'alignTypes': true,
                    'alignFieldNames': false,
                    'alignComments': true,
                    'indentSize': 4,
                    'maxLineLength': 100
                };
                const fullKey = section ? `${section}.${key}` : key;
                return config[fullKey] !== undefined ? config[fullKey] : (config[key] !== undefined ? config[key] : defaultValue);
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

// Import the definition provider
const { ThriftDefinitionProvider } = require('../out/definitionProvider.js');

// Test cases
async function testIncludeNavigation() {
    console.log('Testing include navigation...');
    
    const provider = new ThriftDefinitionProvider();
    
    // Test document with include statement
    const testText = 'include "shared.thrift"\n\nstruct Test {\n    1: string name\n}';
    const document = new vscode.TextDocument(
        vscode.Uri.file('/test/main.thrift'),
        testText
    );
    
    // Test cursor positions in the filename
    const testPositions = [
        { line: 0, character: 9, desc: 'at start of filename (s)' },
        { line: 0, character: 15, desc: 'at dot in filename' },
        { line: 0, character: 16, desc: 'after dot (t)' },
        { line: 0, character: 21, desc: 'at end of filename (t)' }
    ];
    
    for (const pos of testPositions) {
        const position = new vscode.Position(pos.line, pos.character);
        const result = await provider.provideDefinition(document, position);
        
        if (result && result.uri && result.uri.fsPath.includes('shared.thrift')) {
            console.log(`✓ Navigation works ${pos.desc}`);
        } else {
            console.log(`✗ Navigation failed ${pos.desc}`);
        }
    }
    
    // Test cursor outside filename (should not navigate)
    const outsidePosition = new vscode.Position(0, 5); // Before filename
    const outsideResult = await provider.provideDefinition(document, outsidePosition);
    if (!outsideResult || !outsideResult.uri || !outsideResult.uri.fsPath.includes('shared.thrift')) {
        console.log('✓ Correctly ignores cursor outside filename');
    } else {
        console.log('✗ Incorrectly navigates when cursor outside filename');
    }
}

// Test formatting
function testFormatting() {
    console.log('\nTesting formatting...');
    
    try {
        const { ThriftFormattingProvider } = require('../out/formatter.js');
        const formatter = new ThriftFormattingProvider();
        
        const testCode = `struct TestStruct {
    1: required list < string > names,
    2: optional map< string , i32 > values  ,
    3: i32 count
}`;
        
        const document = new vscode.TextDocument(
            vscode.Uri.file('/test/format.thrift'),
            testCode
        );
        
        const options = { insertSpaces: true, tabSize: 4 };
        const edits = formatter.provideDocumentFormattingEdits(document, options);
        
        if (edits && edits.length > 0) {
            const formattedText = edits[0].newText;
            console.log('Formatted code:');
            console.log(formattedText);
            
            // Check if complex types are properly formatted
            if (formattedText.includes('list<string>') && formattedText.includes('map<string,i32>')) {
                console.log('✓ Complex types formatted correctly (no spaces around < >)');
            } else {
                console.log('✗ Complex types not formatted correctly');
            }
        } else {
            console.log('✗ Formatting failed - no edits returned');
        }
    } catch (error) {
        console.log('✗ Formatting test failed:', error.message);
    }
}

// Run tests
async function runTests() {
    try {
        await testIncludeNavigation();
        testFormatting();
        console.log('\nAll tests completed!');
    } catch (error) {
        console.error('Test error:', error);
    }
}

runTests();