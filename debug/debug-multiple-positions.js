const mockVSCode = {
    Position: class {
        constructor(line, character) {
            this.line = line;
            this.character = character;
        }
    },
    Range: class {
        constructor(start, end) {
            if (typeof start === 'number') {
                this.start = new mockVSCode.Position(start, end);
                this.end = new mockVSCode.Position(arguments[2], arguments[3]);
            } else {
                this.start = start;
                this.end = end;
            }
        }
    },
    SelectionRange: class {
        constructor(range, parent) {
            this.range = range;
            this.parent = parent;
        }
    }
};

// Mock the vscode module
const Module = require('module');
const originalRequire = Module.prototype.require;
Module.prototype.require = function(id) {
    if (id === 'vscode') {
        return mockVSCode;
    }
    return originalRequire.apply(this, arguments);
};

const { ThriftSelectionRangeProvider } = require('./out/src/selectionRangeProvider');

function createMockDocument(text) {
    return {
        getText: function(range) {
            if (!range) return text;
            const lines = text.split('\n');
            const startLine = range.start.line;
            const endLine = range.end.line;
            const startChar = range.start.character;
            const endChar = range.end.character;
            
            if (startLine === endLine) {
                return lines[startLine].substring(startChar, endChar);
            } else {
                let result = '';
                for (let i = startLine; i <= endLine; i++) {
                    if (i === startLine) {
                        result += lines[i].substring(startChar);
                    } else if (i === endLine) {
                        result += lines[i].substring(0, endChar);
                    } else {
                        result += lines[i];
                    }
                    if (i < endLine) result += '\n';
                }
                return result;
            }
        }
    };
}

function createMockPosition(line, character) {
    return new mockVSCode.Position(line, character);
}

function createMockCancellationToken() {
    return {
        isCancellationRequested: false
    };
}

function getRangeText(fullText, range) {
    const lines = fullText.split('\n');
    const startLine = range.start.line;
    const endLine = range.end.line;
    const startChar = range.start.character;
    const endChar = range.end.character;
    
    if (startLine === endLine) {
        return lines[startLine].substring(startChar, endChar);
    } else {
        let result = '';
        for (let i = startLine; i <= endLine; i++) {
            if (i === startLine) {
                result += lines[i].substring(startChar);
            } else if (i === endLine) {
                result += lines[i].substring(0, endChar);
            } else {
                result += lines[i];
            }
            if (i < endLine) result += '\n';
        }
        return result;
    }
}

async function debugMultiplePositions() {
    console.log('=== Debugging Multiple Positions Test ===');
    
    const provider = new ThriftSelectionRangeProvider();
    const text = `struct User {
  1: required i32 id,
  2: optional string name
}

enum Status {
  ACTIVE = 1,
  INACTIVE = 2
}`;
    const document = createMockDocument(text);
    
    console.log('Text content:');
    console.log(text);
    
    // Check position (2, 20) specifically
    const position = createMockPosition(2, 20);
    console.log('\nPosition being tested (2, 20):');
    const lines = text.split('\n');
    console.log(`Line 2: "${lines[2]}"`);
    console.log(`Character at position 20: "${lines[2][20]}"`);
    console.log(`Characters around position 20: "${lines[2].substring(18, 23)}"`);
    
    const selectionRanges = await provider.provideSelectionRanges(
        document,
        [position],
        createMockCancellationToken()
    );
    
    console.log('\nSelection ranges result:');
    console.log(JSON.stringify(selectionRanges, null, 2));
    
    if (selectionRanges.length > 0) {
        const firstRange = selectionRanges[0];
        const selectedText = getRangeText(text, firstRange.range);
        console.log('\nFirst range selected text:', JSON.stringify(selectedText));
        
        if (selectedText !== 'name') {
            console.log(`❌ Expected 'name', got '${selectedText}'`);
        } else {
            console.log('✅ Correctly selected "name"');
        }
    }
}

debugMultiplePositions().catch(console.error);