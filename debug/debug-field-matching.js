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

// Manual field parsing to understand what the provider should be doing
function manualFieldParsing() {
    console.log('=== Manual Field Parsing Analysis ===\n');

    const text = `struct User {
  1: required i32 id,
  2: optional string name
}`;
    const lines = text.split('\n');
    const position = {line: 1, character: 13}; // On "i32"

    console.log('Test text:');
    console.log(text);
    console.log('');

    console.log(`Position: line=${position.line}, character=${position.character}`);

    const currentLine = lines[position.line];
    console.log(`Current line: "${currentLine}"`);
    console.log(`Character at position: "${currentLine[position.character] || 'EOF'}"`);
    console.log('');

    // Apply the field regex from the provider
    const fieldRegex = /^(\s*)(\d+)\s*:\s*((?:required|optional)\s+)?([^\s,]+(?:\s*<[^>]+>\s*)?)\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?:=\s*([^,;]+))?\s*[,;]?/;
    const fieldMatch = currentLine.match(fieldRegex);

    if (fieldMatch) {
        console.log('Field match found:');
        console.log('Full match:', JSON.stringify(fieldMatch[0]));
        console.log('Groups:');
        console.log('  1 (leading whitespace):', JSON.stringify(fieldMatch[1]));
        console.log('  2 (field ID):', JSON.stringify(fieldMatch[2]));
        console.log('  3 (requiredness):', JSON.stringify(fieldMatch[3]));
        console.log('  4 (field type):', JSON.stringify(fieldMatch[4]));
        console.log('  5 (field name):', JSON.stringify(fieldMatch[5]));
        console.log('');

        // Extract parts with their positions
        const fullField = fieldMatch[0];
        const fieldIndex = currentLine.indexOf(fullField);
        console.log(`Full field: ${JSON.stringify(fullField)}`);
        console.log(`Field index: ${fieldIndex}`);
        console.log(`Position in field range: ${position.character >= fieldIndex && position.character <= fieldIndex + fullField.length}`);
        console.log('');

        // Calculate precise positions for each component
        let currentIndex = fieldIndex;

        // Skip leading whitespace
        while (currentIndex < fieldIndex + fullField.length && /\s/.test(currentLine[currentIndex])) {
            currentIndex++;
        }
        console.log(`After skipping leading whitespace, currentIndex: ${currentIndex}`);

        // Skip field ID and colon
        currentIndex += fieldMatch[2].length + 1; // +1 for colon
        console.log(`After skipping field ID and colon, currentIndex: ${currentIndex}`);

        // Skip whitespace after colon
        while (currentIndex < fieldIndex + fullField.length && /\s/.test(currentLine[currentIndex])) {
            currentIndex++;
        }
        console.log(`After skipping whitespace after colon, currentIndex: ${currentIndex}`);
        console.log('');

        // Extract requiredness info
        const requiredness = fieldMatch[3]; // Could be "required " or "optional " or undefined
        let requirednessRange = null;
        let fieldTypeStart = currentIndex;
        let fieldTypeEnd = fieldTypeStart;
        let typeRange = null;

        // Skip requiredness keyword if present and set type position accordingly
        if (requiredness) {
            const requirednessStart = currentIndex;
            const requirednessEnd = currentIndex + requiredness.length;
            requirednessRange = {start: requirednessStart, end: requirednessEnd};

            console.log(`Requiredness: ${JSON.stringify(requiredness)}`);
            console.log(`Requiredness start: ${requirednessStart}`);
            console.log(`Requiredness end: ${requirednessEnd}`);

            currentIndex = requirednessEnd;

            // Skip whitespace after requiredness
            while (currentIndex < fieldIndex + fullField.length && /\s/.test(currentLine[currentIndex])) {
                currentIndex++;
            }
            console.log(`After skipping whitespace after requiredness, currentIndex: ${currentIndex}`);

            // Set type position after requiredness
            fieldTypeStart = currentIndex;
            fieldTypeEnd = fieldTypeStart + fieldMatch[4].length;
            typeRange = {start: fieldTypeStart, end: fieldTypeEnd};
        } else {
            // No requiredness keyword, type starts immediately
            fieldTypeStart = currentIndex;
            fieldTypeEnd = fieldTypeStart + fieldMatch[4].length;
            typeRange = {start: fieldTypeStart, end: fieldTypeEnd};
        }

        console.log(`Type start: ${fieldTypeStart}`);
        console.log(`Type end: ${fieldTypeEnd}`);
        console.log(`Type: ${JSON.stringify(currentLine.substring(fieldTypeStart, fieldTypeEnd))}`);
        console.log('');

        // Check proximity
        const proximity = 2;
        const distanceToFieldTypeStart = Math.abs(position.character - fieldTypeStart);
        const distanceToFieldTypeEnd = Math.abs(position.character - fieldTypeEnd);
        const minDistanceToType = Math.min(distanceToFieldTypeStart, distanceToFieldTypeEnd);

        let isNearType = false;
        if (position.character >= fieldTypeStart - proximity && position.character <= fieldTypeEnd + proximity) {
            isNearType = true;
        }

        let isNearRequiredness = false;
        let minDistanceToRequiredness = Infinity;
        if (requiredness && requirednessRange) {
            const requirednessStart = requirednessRange.start;
            const requirednessEnd = requirednessRange.end;
            if (position.character >= requirednessStart - proximity && position.character <= requirednessEnd + proximity) {
                isNearRequiredness = true;
                const distanceToRequirednessStart = Math.abs(position.character - requirednessStart);
                const distanceToRequirednessEnd = Math.abs(position.character - requirednessEnd);
                minDistanceToRequiredness = Math.min(distanceToRequirednessStart, distanceToRequirednessEnd);
            }
        }

        console.log('Distance calculations:');
        console.log(`Position: ${position.character}`);
        console.log(`Distance to type start (${fieldTypeStart}): ${distanceToFieldTypeStart}`);
        console.log(`Distance to type end (${fieldTypeEnd}): ${distanceToFieldTypeEnd}`);
        console.log(`Min distance to type: ${minDistanceToType}`);
        console.log('');

        if (requiredness && requirednessRange) {
            console.log('Requiredness distances:');
            console.log(`Distance to requiredness start (${requirednessRange.start}): ${Math.abs(position.character - requirednessRange.start)}`);
            console.log(`Distance to requiredness end (${requirednessRange.end}): ${Math.abs(position.character - requirednessRange.end)}`);
            console.log(`Min distance to requiredness: ${minDistanceToRequiredness}`);
            console.log('');
        }

        // Special handling for positions between requiredness and type
        let isJustAfterRequiredness = false;
        if (requiredness && requirednessRange) {
            const requirednessEnd = requirednessRange.end;
            // Check if position is right at or just after the requiredness keyword
            if (position.character >= requirednessEnd && position.character <= requirednessEnd + 2) {
                isJustAfterRequiredness = true;
            }
        }

        console.log(`Is just after requiredness: ${isJustAfterRequiredness}`);
        console.log('');

        console.log('Proximity checks:');
        console.log(`Is near type: ${isNearType}`);
        console.log(`Is near requiredness: ${isNearRequiredness}`);
        console.log('');

        // Decision logic
        if (isNearType && isNearRequiredness) {
            console.log('Both near - comparing distances:');
            console.log(`minDistanceToType (${minDistanceToType}) <= minDistanceToRequiredness (${minDistanceToRequiredness}) OR isJustAfterRequiredness (${isJustAfterRequiredness})`);
            if (minDistanceToType <= minDistanceToRequiredness || isJustAfterRequiredness) {
                console.log(`=> SELECT TYPE: "${currentLine.substring(fieldTypeStart, fieldTypeEnd)}"`);
            } else {
                console.log(`=> SELECT REQUIREDNESS: "${currentLine.substring(requirednessRange.start, requirednessRange.end)}"`);
            }
        } else if (isNearType || isJustAfterRequiredness) {
            console.log('Near type or just after requiredness:');
            console.log(`=> SELECT TYPE: "${currentLine.substring(fieldTypeStart, fieldTypeEnd)}"`);
        } else if (isNearRequiredness && requirednessRange) {
            console.log('Near requiredness only:');
            console.log(`=> SELECT REQUIREDNESS: "${currentLine.substring(requirednessRange.start, requirednessRange.end)}"`);
        } else {
            console.log('Not near any specific component');
        }
    } else {
        console.log('No field match found');
    }
}

manualFieldParsing();