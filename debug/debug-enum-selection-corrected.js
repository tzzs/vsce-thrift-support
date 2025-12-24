// Debug script for enum value selection issue - corrected position
const fs = require('fs');
const path = require('path');

// Mock VS Code API
const mockVSCode = {
    Range: class Range {
        constructor(startLine, startChar, endLine, endChar) {
            this.start = { line: startLine, character: startChar };
            this.end = { line: endLine, character: endChar };
        }
    },
    SelectionRange: class SelectionRange {
        constructor(range) {
            this.range = range;
            this.parent = null;
        }
    }
};

// Override require to provide our mock
const Module = require('module');
const originalRequire = Module.prototype.require;
Module.prototype.require = function(id) {
    if (id === 'vscode') {
        return mockVSCode;
    }
    return originalRequire.apply(this, arguments);
};

// Load the compiled provider
const { ThriftSelectionRangeProvider } = require('./out/src/selectionRangeProvider');

function createMockDocument(text) {
    return {
        getText: () => text,
        getWordRangeAtPosition: (position) => {
            const lines = text.split('\n');
            const line = lines[position.line];
            
            // Find word boundaries
            let start = position.character;
            let end = position.character;
            
            // Expand backwards
            while (start > 0 && /[A-Za-z0-9_]/.test(line[start - 1])) {
                start--;
            }
            
            // Expand forwards
            while (end < line.length && /[A-Za-z0-9_]/.test(line[end])) {
                end++;
            }
            
            if (start < end) {
                return new mockVSCode.Range(position.line, start, position.line, end);
            }
            return null;
        }
    };
}

function createMockPosition(line, character) {
    return { line, character };
}

function createMockCancellationToken() {
    return { isCancellationRequested: false };
}

function getRangeText(text, range) {
    const lines = text.split('\n');
    const startLine = range.start.line;
    const startChar = range.start.character;
    const endLine = range.end.line;
    const endChar = range.end.character;
    
    if (startLine === endLine) {
        return lines[startLine].substring(startChar, endChar);
    }
    
    // Multi-line range
    let result = lines[startLine].substring(startChar);
    for (let i = startLine + 1; i < endLine; i++) {
        result += '\n' + lines[i];
    }
    result += '\n' + lines[endLine].substring(0, endChar);
    return result;
}

async function debugEnumSelection() {
    console.log('Debugging enum value selection...\n');

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

    // Test position on "ACTIVE" enum value - CORRECTED POSITION
    const position = createMockPosition(6, 2); // On "ACTIVE" (line 6, not 7)
    
    console.log('Text content:');
    console.log(text);
    console.log('\nTesting position (6, 2) - should select "ACTIVE"');
    console.log('Line 6 content: "' + text.split('\n')[6] + '"');
    console.log('Character at position (6, 2): "' + text.split('\n')[6][2] + '"');

    const selectionRanges = await provider.provideSelectionRanges(
        document,
        [position],
        createMockCancellationToken()
    );

    console.log('\nSelection ranges returned:', selectionRanges.length);
    
    if (selectionRanges.length > 0) {
        const firstRange = selectionRanges[0];
        const selectedText = getRangeText(text, firstRange.range);
        console.log('Selected text: "' + selectedText + '"');
        
        // Check if we have a word range
        const wordRange = document.getWordRangeAtPosition(position);
        if (wordRange) {
            const wordText = getRangeText(text, wordRange);
            console.log('Word range text: "' + wordText + '"');
        }
        
        // Check parent ranges
        let currentRange = firstRange;
        let level = 0;
        while (currentRange) {
            const rangeText = getRangeText(text, currentRange.range);
            console.log(`Level ${level}: "${rangeText}" (${currentRange.range.start.line},${currentRange.range.start.character})-(${currentRange.range.end.line},${currentRange.range.end.character})`);
            currentRange = currentRange.parent;
            level++;
        }
    } else {
        console.log('No selection ranges found!');
    }
}

// Run the debug
debugEnumSelection().catch(console.error);