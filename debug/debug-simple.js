const fs = require('fs');
const path = require('path');
const Module = require('module');

// Mock VS Code API
const mockVSCode = {
    Position: class {
        constructor(line, character) {
            this.line = line;
            this.character = character;
        }
    },
    Range: class {
        constructor(startOrLine, endOrChar, endLine, endChar) {
            // Handle both formats: new Range(start, end) and new Range(startLine, startChar, endLine, endChar)
            if (typeof startOrLine === 'number' && typeof endOrChar === 'number') {
                // Format: new Range(startLine, startChar, endLine, endChar)
                this.start = new mockVSCode.Position(startOrLine, endOrChar);
                this.end = new mockVSCode.Position(endLine, endChar);
            } else {
                // Format: new Range(start, end)
                this.start = startOrLine;
                this.end = endOrChar;
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

// Override require to use our mock
const originalRequire = Module.prototype.require;
Module.prototype.require = function(module) {
    if (module === 'vscode') {
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
        lineCount: text.split('\n').length,
        positionAt: function(offset) {
            const lines = text.split('\n');
            let currentOffset = 0;
            for (let i = 0; i < lines.length; i++) {
                const lineLength = lines[i].length + 1; // +1 for newline
                if (currentOffset + lineLength > offset) {
                    return new mockVSCode.Position(i, offset - currentOffset);
                }
                currentOffset += lineLength;
            }
            return new mockVSCode.Position(lines.length - 1, 0);
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

async function debugSimple() {
    console.log('=== Simple Debug ===');
    
    const provider = new ThriftSelectionRangeProvider();
    const text = `service UserService {
  User getUser(1: i32 userId),
  void createUser(1: User user)
}`;
    const document = createMockDocument(text);
    const position = createMockPosition(1, 6); // On "getUser"
    
    console.log('Text content:');
    console.log(text);
    console.log('\nPosition being tested:');
    const lines = text.split('\n');
    console.log(`Position (1, 6) - Line: "${lines[1]}" - Character: "${lines[1][6]}"`);
    
    const selectionRanges = await provider.provideSelectionRanges(
        document,
        [position],
        createMockCancellationToken()
    );
    
    console.log('\nSelection ranges result:', selectionRanges);
    
    if (!Array.isArray(selectionRanges)) {
        console.log('Selection ranges not returned as array');
        return;
    }
    
    if (selectionRanges.length === 0) {
        console.log('No selection ranges returned');
        return;
    }
    
    const firstRange = selectionRanges[0];
    console.log('\nFirst range:', firstRange);
    console.log('First range type:', typeof firstRange);
    console.log('First range.range:', firstRange.range);
    
    if (firstRange.range) {
        console.log('Range start:', firstRange.range.start);
        console.log('Range end:', firstRange.range.end);
        console.log('Range start type:', typeof firstRange.range.start);
        console.log('Range end type:', typeof firstRange.range.end);
        console.log('Range start keys:', Object.keys(firstRange.range.start || {}));
        console.log('Range end keys:', Object.keys(firstRange.range.end || {}));
        
        if (firstRange.range.start && firstRange.range.end) {
            const startLine = firstRange.range.start.line;
            const startChar = firstRange.range.start.character;
            const endLine = firstRange.range.end.line;
            const endChar = firstRange.range.end.character;
            
            console.log(`Range: (${startLine}, ${startChar}) to (${endLine}, ${endChar})`);
            
            if (startLine === endLine) {
                const selectedText = lines[startLine].substring(startChar, endChar);
                console.log(`Selected text: "${selectedText}"`);
            }
        }
    }
    
    if (firstRange.parent) {
        console.log('Has parent range');
    } else {
        console.log('No parent range');
    }
}

debugSimple().catch(console.error);