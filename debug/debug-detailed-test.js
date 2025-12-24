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
    const lines = text.split('\n');
    return {
        uri: {fsPath: path.join(__dirname, 'test-files', fileName)},
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

// Detailed test for type reference selection
async function detailedTestTypeReferenceSelection() {
    console.log('=== Detailed Test for Type Reference Selection ===\n');

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

    const lines = text.split('\n');
    const currentLine = lines[position.line];
    console.log(`Current line: "${currentLine}"`);
    console.log(`Character at position: "${currentLine[position.character] || 'EOF'}"`);
    console.log('');

    const selectionRanges = await provider.provideSelectionRanges(
        document,
        [position],
        createMockCancellationToken()
    );

    if (!Array.isArray(selectionRanges)) {
        throw new Error('Selection ranges not returned as array');
    }

    const firstRange = selectionRanges[0];
    const selectedText = getRangeText(text, firstRange.range);

    console.log(`Actually selected text: "${selectedText}"`);
    console.log(`Expected text: "i32"`);

    if (selectedText !== 'i32') {
        console.log(`❌ Test FAILED: Expected 'i32', got '${selectedText}'`);

        // Show the range details
        console.log(`\nSelected range details:`);
        console.log(`  Start: line=${firstRange.range.start.line}, character=${firstRange.range.start.character}`);
        console.log(`  End: line=${firstRange.range.end.line}, character=${firstRange.range.end.character}`);

        // Try to understand what happened by checking all possible ranges
        console.log(`\nAnalyzing all ranges:`);
        let current = firstRange;
        let level = 0;
        while (current) {
            const rangeText = getRangeText(text, current.range);
            console.log(`  Level ${level}: "${rangeText}"`);
            current = current.parent;
            level++;
        }
    } else {
        console.log('✅ Test PASSED');
    }
}

detailedTestTypeReferenceSelection().catch((error) => {
    console.error('Test execution failed:', error);
    process.exit(1);
});