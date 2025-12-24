const fs = require('fs');
const path = require('path');

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
    return {
        fileName: fileName,
        getText: () => text,
        getWordRangeAtPosition: (position) => {
            const lines = text.split('\n');
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

    let result = '';
    for (let i = range.start.line; i <= range.end.line; i++) {
        if (i === range.start.line) {
            result += lines[i].substring(range.start.character);
        } else if (i === range.end.line) {
            result += lines[i].substring(0, range.end.character);
        } else {
            result += lines[i];
        }
        if (i < range.end.line) {
            result += '\n';
        }
    }
    return result;
}

async function debugSelection() {
    console.log('Debugging selection range provider...');

    const provider = new ThriftSelectionRangeProvider();
    const text = `struct User {
  1: required i32 id,
  2: optional string name
}`;
    const document = createMockDocument(text);
    const position = createMockPosition(1, 13); // On "i32"

    const line = document.getText().split('\n')[1];
    console.log('Line being processed:', JSON.stringify(line));
    console.log('Line length:', line.length);
    console.log('Character at position 13:', JSON.stringify(line[13]));
    for (let i = 10; i <= 17; i++) {
        console.log(`Character at position ${i}:`, JSON.stringify(line[i]));
    }

    const selectionRanges = await provider.provideSelectionRanges(
        document,
        [position],
        createMockCancellationToken()
    );

    if (!Array.isArray(selectionRanges)) {
        console.log('Selection ranges not returned as array');
        return;
    }

    const firstRange = selectionRanges[0];
    if (!firstRange) {
        console.log('No selection range returned');
        return;
    }

    const selectedText = getRangeText(text, firstRange.range);
    console.log('Selected text:', JSON.stringify(selectedText));
    console.log('Expected: "i32"');
    console.log('Range:', firstRange.range.start.line, firstRange.range.start.character, 'to', firstRange.range.end.line, firstRange.range.end.character);
}

debugSelection();