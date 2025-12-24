const fs = require('fs');
const path = require('path');

// Simple debug script to test selection range provider behavior

// Enhanced vscode mock for selection range provider testing
const vscode = {
    SelectionRange: class {
        constructor(range) {
            this.range = range;
            this.parent = null;
        }
    },
    Range: class {
        constructor(startLine, startChar, endLine, endChar) {
            this.start = {line: startLine, character: startChar};
            this.end = {line: endLine, character: endChar};
        }
    },
    Position: class {
        constructor(line, character) {
            this.line = line;
            this.character = character;
        }
    },
    workspace: {
        getWordRangeAtPosition: (document, position) => {
            const lines = document.getText().split('\n');
            const lineText = lines[position.line] || '';
            const wordRegex = /[A-Za-z_][A-Za-z0-9_]*/g;
            let match;
            while ((match = wordRegex.exec(lineText)) !== null) {
                if (position.character >= match.index && position.character <= match.index + match[0].length) {
                    return new vscode.Range(position.line, match.index, position.line, match.index + match[0].length);
                }
            }
            return null;
        }
    }
};

// Hook require('vscode')
const Module = require('module');
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
    if (request === 'vscode') return vscode;
    return originalLoad.apply(this, arguments);
};

const {ThriftSelectionRangeProvider} = require('./out/src/selectionRangeProvider.js');

function createMockDocument(text, fileName = 'test.thrift') {
    const lines = text.split('\n');
    return {
        uri: {fsPath: path.join(__dirname, 'tests', 'test-files', fileName)},
        getText: () => text,
        lineAt: (line) => ({text: lines[line] || ''}),
        getWordRangeAtPosition: (position) => {
            const lineText = lines[position.line] || '';
            const wordRegex = /[A-Za-z_][A-Za-z0-9_]*/g;
            let match;
            while ((match = wordRegex.exec(lineText)) !== null) {
                if (position.character >= match.index && position.character <= match.index + match[0].length) {
                    return new vscode.Range(position.line, match.index, position.line, match.index + match[0].length);
                }
            }
            return null;
        }
    };
}

function createMockPosition(line, character) {
    return new vscode.Position(line, character);
}

function createMockCancellationToken() {
    return {isCancellationRequested: false};
}

function getRangeText(text, range) {
    const lines = text.split('\n');
    if (range.start.line === range.end.line) {
        return lines[range.start.line].substring(range.start.character, range.end.character);
    }
    // Multi-line range
    let result = lines[range.start.line].substring(range.start.character);
    for (let i = range.start.line + 1; i < range.end.line; i++) {
        result += '\n' + lines[i];
    }
    result += '\n' + lines[range.end.line].substring(0, range.end.character);
    return result;
}

async function debugTypeReferenceSelection() {
    console.log('=== Debugging Type Reference Selection ===\n');

    const provider = new ThriftSelectionRangeProvider();
    const text = `struct User {
  1: required i32 id,
  2: optional string name
}`;
    const document = createMockDocument(text);
    const position = createMockPosition(1, 13); // On "i32"

    console.log('Test text:');
    console.log(text);
    console.log('');
    console.log(`Position: line=${position.line}, character=${position.character}`);
    console.log(`Character at position: "${text.split('\n')[position.line][position.character]}"`);
    console.log('');

    const selectionRanges = await provider.provideSelectionRanges(
        document,
        [position],
        createMockCancellationToken()
    );

    if (!Array.isArray(selectionRanges)) {
        console.log('Selection ranges not returned as array');
        return;
    }

    if (selectionRanges.length === 0) {
        console.log('No selection ranges returned');
        return;
    }

    const firstRange = selectionRanges[0];
    const selectedText = getRangeText(text, firstRange.range);

    console.log(`Selected text: "${selectedText}"`);
    console.log(`Range: [${firstRange.range.start.line}, ${firstRange.range.start.character}] to [${firstRange.range.end.line}, ${firstRange.range.end.character}]`);

    // Print the hierarchy
    let current = firstRange;
    let level = 0;
    while (current) {
        const rangeText = getRangeText(text, current.range);
        console.log(`Level ${level}: "${rangeText}"`);
        current = current.parent;
        level++;
    }

    // Additional debugging for the specific case
    console.log('\n--- Detailed Debug Info ---');
    console.log('Field components:');
    console.log('  required: positions 5-13');
    console.log('  space: position 13');
    console.log('  i32: positions 14-16');
    console.log('  space: position 17');
    console.log('  id: positions 18-19');
    console.log(`Cursor position: ${position.character}`);
    console.log('Distances:');
    console.log(`  To required start (5): ${Math.abs(position.character - 5)}`);
    console.log(`  To required end (13): ${Math.abs(position.character - 13)}`);
    console.log(`  To i32 start (14): ${Math.abs(position.character - 14)}`);
    console.log(`  To i32 end (16): ${Math.abs(position.character - 16)}`);
}

debugTypeReferenceSelection().catch((error) => {
    console.error('Debug test failed:', error);
    process.exit(1);
});