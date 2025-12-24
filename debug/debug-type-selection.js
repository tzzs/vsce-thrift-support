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

async function debugTypeSelection() {
    console.log('=== Debugging Type Selection Test ===');
    
    const provider = new ThriftSelectionRangeProvider();
    const text = `struct User {
  1: required i32 id,
  2: optional string name
}`;
    const document = createMockDocument(text);
    const position = createMockPosition(1, 13); // On "i32"
    
    console.log('Text content:');
    console.log(text);
    console.log('\nPosition being tested:');
    const lines = text.split('\n');
    console.log(`Position (1, 13) - Line: "${lines[1]}"`);
    console.log(`Character at position 13: "${lines[1][13]}"`);
    console.log(`Characters around position 13: "${lines[1].substring(10, 20)}"`);
    
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
        
        if (firstRange.range.start && firstRange.range.end) {
            const startLine = firstRange.range.start.line;
            const startChar = firstRange.range.start.character;
            const endLine = firstRange.range.end.line;
            const endChar = firstRange.range.end.character;
            
            console.log(`Range: (${startLine}, ${startChar}) to (${endLine}, ${endChar})`);
            
            if (startLine === endLine) {
                const selectedText = lines[startLine].substring(startChar, endChar);
                console.log(`Selected text: "${selectedText}"`);
                
                if (selectedText !== 'i32') {
                    console.log(`❌ Expected 'i32', got '${selectedText}'`);
                } else {
                    console.log('✅ Correctly selected "i32"');
                }
            }
        }
    }
    
    if (firstRange.parent) {
        console.log('Has parent range');
    } else {
        console.log('No parent range');
    }
}

debugTypeSelection().catch(console.error);