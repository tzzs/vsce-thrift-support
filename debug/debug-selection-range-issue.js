const fs = require('fs');
const path = require('path');

// Enhanced vscode mock for selection range provider testing
const vscode = {
    SelectionRange: class {
        constructor(range, parent = null) {
            this.range = range;
            this.parent = parent;
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

function printSelectionRangeHierarchy(selectionRange, text, level = 0) {
    const indent = '  '.repeat(level);
    const rangeText = getRangeText(text, selectionRange.range);
    console.log(`${indent}Level ${level}: "${rangeText}" [${selectionRange.range.start.line}:${selectionRange.range.start.character}-${selectionRange.range.end.line}:${selectionRange.range.end.character}]`);

    if (selectionRange.parent) {
        printSelectionRangeHierarchy(selectionRange.parent, text, level + 1);
    }
}

async function debugTypeReferenceSelection() {
    console.log('=== Debugging Type Reference Selection Issue ===\n');

    const provider = new ThriftSelectionRangeProvider();
    const text = `struct User {
  1: required i32 id,
  2: optional string name
}`;
    const document = createMockDocument(text);
    const position = createMockPosition(1, 13); // On "i32" - this is the problematic position

    console.log('Test text:');
    console.log(text);
    console.log('');
    console.log(`Position: line=${position.line}, character=${position.character}`);
    console.log('');

    // Let's first check what the current line looks like
    const lines = text.split('\n');
    const currentLine = lines[position.line];
    console.log(`Current line: "${currentLine}"`);
    console.log(`Character at position ${position.character}: "${currentLine[position.character]}"`);
    console.log('');

    // Let's manually check the field regex matching
    const fieldMatch = currentLine.match(/^(\s*)(\d+)\s*:\s*(?:required|optional)?\s*([^\s,]+(?:\s*<[^>]+>\s*)?)\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?:=\s*([^,;]+))?\s*[,;]?/);
    console.log('Field regex match result:');
    if (fieldMatch) {
        console.log('Full match:', fieldMatch[0]);
        console.log('Groups:');
        console.log('  1 (whitespace):', JSON.stringify(fieldMatch[1]));
        console.log('  2 (field id):', fieldMatch[2]);
        console.log('  3 (field type):', fieldMatch[3]);
        console.log('  4 (field name):', fieldMatch[4]);
        console.log('  5 (default value):', fieldMatch[5]);

        // Check indices
        const fieldType = fieldMatch[3];
        const fieldTypeIndex = currentLine.indexOf(fieldType, fieldMatch.index);
        console.log(`Field type "${fieldType}" found at index: ${fieldTypeIndex}`);
        console.log(`Position ${position.character} is ${position.character >= fieldTypeIndex && position.character <= fieldTypeIndex + fieldType.length ? '' : 'NOT '}within field type range`);
    } else {
        console.log('No field match found');
    }
    console.log('');

    // Now let's run the actual provider
    const selectionRanges = await provider.provideSelectionRanges(
        document,
        [position],
        createMockCancellationToken()
    );

    console.log(`Found ${selectionRanges.length} selection ranges:`);
    if (selectionRanges.length > 0) {
        printSelectionRangeHierarchy(selectionRanges[0], text);

        const firstRangeText = getRangeText(text, selectionRanges[0].range);
        console.log(`\nFirst range text: "${firstRangeText}"`);

        if (firstRangeText !== 'i32') {
            console.log(`❌ ISSUE: Expected 'i32', got '${firstRangeText}'`);
        } else {
            console.log('✅ Correct selection');
        }
    } else {
        console.log('No selection ranges found');
    }
}

debugTypeReferenceSelection().catch(console.error);