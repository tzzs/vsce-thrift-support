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

        contains(position) {
            // Check if position is within this range
            if (position.line < this.start.line || position.line > this.end.line) {
                return false;
            }

            if (position.line === this.start.line && position.character < this.start.character) {
                return false;
            }

            if (position.line === this.end.line && position.character > this.end.character) {
                return false;
            }

            return true;
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

// Test the specific failing case with detailed character analysis
async function debugDetailedCharacterAnalysis() {
    console.log('Detailed character analysis...\n');

    const text = `struct User {
  1: required i32 id,
  2: optional string name
}`;

    const lines = text.split('\n');
    const testLine = lines[1];

    console.log('Test line:', JSON.stringify(testLine));
    console.log('Characters with positions:');
    for (let i = 0; i < testLine.length; i++) {
        console.log(`  ${i}: "${testLine.charAt(i)}" (${testLine.charCodeAt(i)})`);
    }
    console.log('');

    // Show where "i32" actually starts
    const i32Index = testLine.indexOf('i32');
    console.log('"i32" starts at character position:', i32Index);
    console.log('"i32" ends at character position:', i32Index + 3);
    console.log('');

    // Show where "required" ends
    const requiredIndex = testLine.indexOf('required');
    console.log('"required" starts at character position:', requiredIndex);
    console.log('"required" ends at character position:', requiredIndex + 8);
    console.log('');

    // Analyze the space between "required" and "i32"
    console.log('Space between "required" and "i32":');
    for (let i = requiredIndex + 8; i < i32Index; i++) {
        console.log(`  ${i}: "${testLine.charAt(i)}" (${testLine.charCodeAt(i)})`);
    }
    console.log('');

    console.log('Test positions:');
    console.log('  Position 13:', `"${testLine.charAt(13)}"`);
    console.log('  Position 14:', `"${testLine.charAt(14)}"`);
    console.log('  Position 15:', `"${testLine.charAt(15)}"`);
    console.log('  Position 16:', `"${testLine.charAt(16)}"`);
    console.log('');
}

debugDetailedCharacterAnalysis().catch(console.error);