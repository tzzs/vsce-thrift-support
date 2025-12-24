// Debug script to test the exact scenario from the failing test
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

async function debugMultiplePositionsTest() {
    console.log('Debugging multiple positions test scenario...\n');

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

    // Test the exact positions from the failing test
    const positions = [
        createMockPosition(1, 18), // On "id"
        createMockPosition(2, 20), // On "name"
        createMockPosition(7, 2)   // On "ACTIVE" - but this is actually INACTIVE!
    ];

    console.log('Text content:');
    console.log(text);
    console.log('\nPositions being tested:');
    positions.forEach((pos, i) => {
        const line = text.split('\n')[pos.line];
        console.log(`Position ${i}: (${pos.line}, ${pos.character}) - Line: "${line}" - Character: "${line[pos.character]}"`);
    });

    const selectionRanges = await provider.provideSelectionRanges(
        document,
        positions,
        createMockCancellationToken()
    );

    console.log('\nSelection ranges returned:', selectionRanges.length);
    
    if (selectionRanges.length === 3) {
        // Check each range
        const idRange = selectionRanges[0];
        const nameRange = selectionRanges[1];
        const activeRange = selectionRanges[2];

        const idText = getRangeText(text, idRange.range);
        const nameText = getRangeText(text, nameRange.range);
        const activeText = getRangeText(text, activeRange.range);

        console.log('\nResults:');
        console.log(`id range: "${idText}"`);
        console.log(`name range: "${nameText}"`);
        console.log(`active range: "${activeText}"`);

        console.log('\nExpected vs Actual:');
        console.log(`id: Expected 'id', got '${idText}' - ${idText === 'id' ? '✓' : '✗'}`);
        console.log(`name: Expected 'name', got '${nameText}' - ${nameText === 'name' ? '✓' : '✗'}`);
        console.log(`active: Expected 'ACTIVE', got '${activeText}' - ${activeText === 'ACTIVE' ? '✓' : '✗'}`);
        
        if (activeText !== 'ACTIVE') {
            console.log('\n❌ The test expects "ACTIVE" but position (7, 2) is actually on "INACTIVE"');
            console.log('This suggests the test position is wrong, not the provider logic.');
            console.log('Position (6, 2) would be on "ACTIVE":');
            
            // Test the correct position
            const correctPosition = createMockPosition(6, 2);
            const correctResult = await provider.provideSelectionRanges(
                document,
                [correctPosition],
                createMockCancellationToken()
            );
            if (correctResult.length > 0) {
                const correctText = getRangeText(text, correctResult[0].range);
                console.log(`Position (6, 2) selects: "${correctText}"`);
            }
        }
    } else {
        console.log('Expected 3 selection ranges, got', selectionRanges.length);
    }
}

// Run the debug
debugMultiplePositionsTest().catch(console.error);