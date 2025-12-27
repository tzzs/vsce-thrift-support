// Unit test for hover provider - completely isolated version
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const Module = require('module');

// Create a completely fresh mock VSCode API to avoid any state issues
const freshMockVscode = {
    workspace: {
        textDocuments: [],
        findFiles: async function(pattern, exclude) {
            console.log('Fresh mock findFiles called with pattern:', pattern);
            return []; // Prevent finding any workspace files
        },
        fs: {
            readFile: async function(uri) {
                // Instead of throwing error, return empty buffer
                return Buffer.from('');
            },
            stat: async function(uri) {
                return { type: 1 }; // File type
            }
        }
    },
    Uri: {
        file: function(path) {
            return { fsPath: path, toString: () => path };
        }
    },
    Location: class Location {
        constructor(uri, range) {
            this.uri = uri;
            this.range = range;
        }
    },
    Range: class Range {
        constructor(startLine, startChar, endLine, endChar) {
            this.start = { line: startLine, character: startChar };
            this.end = { line: endLine, character: endChar };
        }
    },
    Position: class Position {
        constructor(line, character) {
            this.line = line;
            this.character = character;
        }
        
        toString() {
            return `${this.line}:${this.character}`;
        }
    },
    MarkdownString: class MarkdownString {
        constructor(value) {
            this.value = value || '';
            this.isTrusted = false;
            this.supportHtml = false;
        }
        
        appendText(value) {
            this.value += value;
            return this;
        }
        
        appendMarkdown(value) {
            this.value += value;
            return this;
        }
        
        appendCodeblock(value, language) {
            this.value += '```' + (language || '') + '\n' + value + '\n```';
            return this;
        }
    },
    Hover: class Hover {
        constructor(contents, range) {
            this.contents = contents;
            this.range = range;
        }
    }
};

// Store original require
const originalRequire = Module.prototype.require;

// Override require to use our fresh mock
Module.prototype.require = function(id) {
    if (id === 'vscode') {
        return freshMockVscode;
    }
    return originalRequire.apply(this, arguments);
};

// Load the hover provider with fresh mock
const { ThriftHoverProvider } = require('../../../out/src/hoverProvider.js');

function createMockDocument(text, fileName = 'test.thrift') {
    const lines = text.split('\n');
    const uri = freshMockVscode.Uri.file(path.join(__dirname, '..', '..', 'test-files', fileName));
    
    // Clear existing documents to ensure we only have the current one
    freshMockVscode.workspace.textDocuments = [];
    
    const document = {
        uri: uri,
        getText: () => text,
        lineAt: (line) => ({ 
            text: lines[line] || '',
            lineNumber: line
        }),
        getWordRangeAtPosition: (position) => {
            const lineText = lines[position.line] || '';
            const wordRegex = /\b([A-Za-z_][A-Za-z0-9_]*)\b/g;
            let match;
            while ((match = wordRegex.exec(lineText)) !== null) {
                const start = match.index;
                const end = start + match[0].length;
                if (position.character >= start && position.character <= end) {
                    return new freshMockVscode.Range(position.line, start, position.line, end);
                }
            }
            return null;
        },
        offsetAt: (position) => {
            let offset = 0;
            for (let i = 0; i < position.line; i++) {
                offset += (lines[i] || '').length + 1; // +1 for newline
            }
            return offset + position.character;
        },
        positionAt: (offset) => {
            let currentOffset = 0;
            for (let i = 0; i < lines.length; i++) {
                const lineLength = (lines[i] || '').length + 1; // +1 for newline
                if (currentOffset + lineLength > offset) {
                    return new freshMockVscode.Position(i, offset - currentOffset);
                }
                currentOffset += lineLength;
            }
            return new freshMockVscode.Position(lines.length - 1, lines[lines.length - 1].length);
        }
    };
    
    // Add to workspace textDocuments
    freshMockVscode.workspace.textDocuments.push(document);
    
    return document;
}

function createMockPosition(line, character) {
    return new freshMockVscode.Position(line, character);
}

function createMockCancellationToken() {
    return { isCancellationRequested: false };
}

async function run() {
    console.log('Running hover provider tests with completely fresh mock...');
    
    try {
        const provider = new ThriftHoverProvider();
        
        // Test 1: Hover over struct type with documentation
        console.log('Testing hover over struct type with documentation...');
        const structText = `// UniqueStruct123 information structure
struct UniqueStruct123 {
    1: required string name
}

// Profile data
struct Profile {
    1: required UniqueStruct123 user
}`;
        const structDocument = createMockDocument(structText);
        const structPosition = createMockPosition(7, 18); // On "UniqueStruct123" in Profile struct
        
        const structHover = await provider.provideHover(
            structDocument,
            structPosition,
            createMockCancellationToken()
        );
        
        console.log('Struct hover result:', JSON.stringify(structHover, null, 2));
        
        if (structHover) {
            assert(structHover.contents, 'Should have hover contents');
            assert(structHover.contents.value.includes('struct UniqueStruct123'), 'Should show struct signature');
            assert(structHover.contents.value.includes('UniqueStruct123 information structure'), 'Should include documentation');
            console.log('✅ Struct hover test passed!');
        } else {
            console.log('❌ Struct hover not found');
            throw new Error('Expected hover to be found');
        }
        
        // Test 2: Hover over enum type
        console.log('\nTesting hover over enum type...');
        const enumText = `// Status enumeration
enum Status {
    ACTIVE = 1,
    INACTIVE = 2
}

struct User {
    1: required Status status
}`;
        const enumDocument = createMockDocument(enumText);
        const enumPosition = createMockPosition(7, 18); // On "Status" in User struct
        
        // Debug: Check what the definition provider finds for enum
        const enumDefProvider = provider.getDefinitionProvider();
        console.log('Testing definition provider for enum...');
        
        // Check what word is being extracted for enum
        const enumWordRange = enumDocument.getWordRangeAtPosition(enumPosition);
        console.log('Enum word range at position:', JSON.stringify(enumWordRange));
        if (enumWordRange) {
            const enumLineText = enumDocument.lineAt(enumPosition.line).text;
            const enumWord = enumLineText.substring(enumWordRange.start.character, enumWordRange.end.character);
            console.log('Enum extracted word:', enumWord);
        }
        
        // Check enum definition in current document
        console.log('Testing enum definition in current document...');
        const enumDocDef = await enumDefProvider.findDefinitionInDocument(
            enumDocument.uri,
            enumDocument.getText(),
            'Status'
        );
        console.log('Enum document definition:', JSON.stringify(enumDocDef, null, 2));
        
        const enumHover = await provider.provideHover(
            enumDocument,
            enumPosition,
            createMockCancellationToken()
        );
        
        console.log('Enum hover result:', JSON.stringify(enumHover, null, 2));
        
        if (enumHover) {
            assert(enumHover.contents, 'Should have hover contents');
            assert(enumHover.contents.value.includes('enum Status'), 'Should show enum signature');
            assert(enumHover.contents.value.includes('Status enumeration'), 'Should include documentation');
            console.log('✅ Enum hover test passed!');
        } else {
            console.log('❌ Enum hover not found');
            throw new Error('Expected hover to be found');
        }
        
        // Test 3: Hover over service type
        console.log('\nTesting hover over service type...');
        const serviceText = `// User service interface
service UserService {
    User getUser(1: i32 id)
}

struct User {
    1: required UserService service
}`;
        const serviceDocument = createMockDocument(serviceText);
        const servicePosition = createMockPosition(6, 18); // On "UserService" in User struct
        
        const serviceHover = await provider.provideHover(
            serviceDocument,
            servicePosition,
            createMockCancellationToken()
        );
        
        console.log('Service hover result:', JSON.stringify(serviceHover, null, 2));
        
        if (serviceHover) {
            assert(serviceHover.contents, 'Should have hover contents');
            assert(serviceHover.contents.value.includes('service UserService'), 'Should show service signature');
            assert(serviceHover.contents.value.includes('User service interface'), 'Should include documentation');
            console.log('✅ Service hover test passed!');
        } else {
            console.log('❌ Service hover not found');
            throw new Error('Expected hover to be found');
        }
        
        console.log('\n🎉 All hover provider tests passed!');
        
    } catch (error) {
        console.error('❌ Hover provider test failed:', error.message);
        console.error(error.stack);
        throw error;
    }
}

// Run the test
if (require.main === module) {
    run().catch(console.error);
}

module.exports = { run };