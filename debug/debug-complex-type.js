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
                let result = lines[startLine].substring(startChar);
                for (let i = startLine + 1; i < endLine; i++) {
                    result += '\n' + lines[i];
                }
                result += '\n' + lines[endLine].substring(0, endChar);
                return result;
            }
        },
        lineAt: function(line) {
            const lines = text.split('\n');
            return {
                text: lines[line]
            };
        },
        getWordRangeAtPosition: function(position) {
            const line = text.split('\n')[position.line];
            const char = position.character;
            
            // Simple word boundary detection
            let start = char;
            let end = char;
            
            // Find start of word
            while (start > 0 && /[a-zA-Z0-9_<>,]/.test(line[start - 1])) {
                start--;
            }
            
            // Find end of word
            while (end < line.length && /[a-zA-Z0-9_<>,]/.test(line[end])) {
                end++;
            }
            
            return new mockVSCode.Range(position.line, start, position.line, end);
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

function getRangeText(text, range) {
    const lines = text.split('\n');
    const startLine = range.start.line;
    const endLine = range.end.line;
    const startChar = range.start.character;
    const endChar = range.end.character;
    
    if (startLine === endLine) {
        return lines[startLine].substring(startChar, endChar);
    } else {
        let result = lines[startLine].substring(startChar);
        for (let i = startLine + 1; i < endLine; i++) {
            result += '\n' + lines[i];
        }
        result += '\n' + lines[endLine].substring(0, endChar);
        return result;
    }
}

async function debugComplexTypeSelection() {
    console.log('=== Debugging Complex Type Selection Test ===');
    
    const provider = new ThriftSelectionRangeProvider();
    const text = `struct User {
  1: required list<string> tags,
  2: optional map<string, i32> scores
}`;
    const document = createMockDocument(text);
    const position = createMockPosition(1, 20); // On "list<string>"
    
    console.log('Text content:');
    console.log(text);
    console.log('\nPosition being tested:');
    const lines = text.split('\n');
    console.log(`Position (1, 20) - Line: "${lines[1]}"`);
    console.log(`Line length: ${lines[1].length}`);
    console.log(`Character at position 20: "${lines[1][20]}"`);
    console.log(`Characters around position 20: "${lines[1].substring(18, 23)}"`);
    
    // Let's see what the word range detection finds
    const wordRange = document.getWordRangeAtPosition(position);
    console.log(`Word range detected: start=${wordRange.start.character}, end=${wordRange.end.character}`);
    console.log(`Word range text: "${getRangeText(text, wordRange)}"`);
    
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
        
        if (selectedText !== 'list<string>') {
            console.log(`❌ Expected 'list<string>', got '${selectedText}'`);
        } else {
            console.log('✅ Correctly selected "list<string>"');
        }
    }
}

debugComplexTypeSelection().catch(console.error);