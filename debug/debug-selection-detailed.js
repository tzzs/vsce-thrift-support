const fs = require('fs');
const path = require('path');

// Simple debug script to test selection range provider behavior with detailed logging

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
    console.log('=== Debugging Type Reference Selection (Detailed) ===\n');

    const provider = new ThriftSelectionRangeProvider();
    const text = `struct User {
  1: required i32 id,
  2: optional string name
}`;
    const document = createMockDocument(text);
    const position = createMockPosition(1, 13); // On space between "required" and "i32"

    console.log('Test text:');
    console.log(text);
    console.log('');
    console.log(`Position: line=${position.line}, character=${position.character}`);
    console.log(`Character at position: "${text.split('\n')[position.line][position.character]}"`);
    console.log('');

    // Manual analysis
    console.log('Manual Analysis:');
    const line = text.split('\n')[position.line];
    console.log(`Line: "${line}"`);

    // Field pattern matching
    const fieldMatch = line.match(/^(\s*)(\d+)\s*:\s*((?:required|optional)\s+)?([^\s,]+(?:\s*<[^>]+>\s*)?)\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?:=\s*([^,;]+))?\s*[,;]?/);
    if (fieldMatch) {
        console.log('Field Match Groups:');
        fieldMatch.forEach((group, index) => {
            console.log(`  Group ${index}: "${group}"`);
        });

        const fullField = fieldMatch[0];
        const fieldIndex = line.indexOf(fullField);
        console.log(`Full field: "${fullField}" at index ${fieldIndex}`);

        const fieldId = fieldMatch[2];
        const requiredness = fieldMatch[3]; // Could be "required " or "optional " or undefined
        const fieldTypeWithModifiers = fieldMatch[4];
        const fieldName = fieldMatch[5];

        console.log(`Field ID: "${fieldId}"`);
        console.log(`Requiredness: "${requiredness}"`);
        console.log(`Field Type: "${fieldTypeWithModifiers}"`);
        console.log(`Field Name: "${fieldName}"`);

        // Calculate positions
        let currentIndex = fieldIndex;

        // Skip leading whitespace
        while (currentIndex < fieldIndex + fullField.length && /\s/.test(line[currentIndex])) {
            currentIndex++;
        }
        console.log(`After skipping whitespace: currentIndex = ${currentIndex}`);

        // Skip field ID and colon
        currentIndex += fieldId.length + 1; // +1 for colon
        console.log(`After field ID and colon: currentIndex = ${currentIndex}`);

        // Skip whitespace after colon
        while (currentIndex < fieldIndex + fullField.length && /\s/.test(line[currentIndex])) {
            currentIndex++;
        }
        console.log(`After whitespace after colon: currentIndex = ${currentIndex}`);

        // Handle requiredness
        let requirednessStart = -1;
        let requirednessEnd = -1;
        let fieldTypeStart = currentIndex;
        let fieldTypeEnd = fieldTypeStart;

        if (requiredness) {
            requirednessStart = currentIndex;
            requirednessEnd = currentIndex + requiredness.length;
            console.log(`Requiredness: "${requiredness}" from ${requirednessStart} to ${requirednessEnd}`);

            currentIndex = requirednessEnd;

            // Skip whitespace after requiredness
            while (currentIndex < fieldIndex + fullField.length && /\s/.test(line[currentIndex])) {
                currentIndex++;
            }
            console.log(`After whitespace after requiredness: currentIndex = ${currentIndex}`);

            // Set type position after requiredness
            fieldTypeStart = currentIndex;
            fieldTypeEnd = fieldTypeStart + fieldTypeWithModifiers.length;
            console.log(`Field Type: "${fieldTypeWithModifiers}" from ${fieldTypeStart} to ${fieldTypeEnd}`);
        } else {
            // No requiredness keyword, type starts immediately
            fieldTypeStart = currentIndex;
            fieldTypeEnd = fieldTypeStart + fieldTypeWithModifiers.length;
            console.log(`Field Type (no requiredness): "${fieldTypeWithModifiers}" from ${fieldTypeStart} to ${fieldTypeEnd}`);
        }

        // Distance calculations
        console.log('\nDistance Calculations:');
        console.log(`Cursor position: ${position.character}`);

        let minDistanceToRequiredness = Infinity;
        if (requiredness) {
            const distanceToRequirednessStart = Math.abs(position.character - requirednessStart);
            const distanceToRequirednessEnd = Math.abs(position.character - requirednessEnd);
            minDistanceToRequiredness = Math.min(distanceToRequirednessStart, distanceToRequirednessEnd);
            console.log(`Distance to requiredness start (${requirednessStart}): ${distanceToRequirednessStart}`);
            console.log(`Distance to requiredness end (${requirednessEnd}): ${distanceToRequirednessEnd}`);
            console.log(`Min distance to requiredness: ${minDistanceToRequiredness}`);
        }

        const distanceToFieldTypeStart = Math.abs(position.character - fieldTypeStart);
        const distanceToFieldTypeEnd = Math.abs(position.character - fieldTypeEnd);
        const minDistanceToType = Math.min(distanceToFieldTypeStart, distanceToFieldTypeEnd);
        console.log(`Distance to field type start (${fieldTypeStart}): ${distanceToFieldTypeStart}`);
        console.log(`Distance to field type end (${fieldTypeEnd}): ${distanceToFieldTypeEnd}`);
        console.log(`Min distance to type: ${minDistanceToType}`);

        // Proximity checks
        const proximity = 2;
        console.log(`\nProximity Checks (proximity = ${proximity}):`);

        let isNearType = false;
        if (position.character >= fieldTypeStart - proximity && position.character <= fieldTypeEnd + proximity) {
            isNearType = true;
            console.log(`Is near type: true`);
        } else {
            console.log(`Is near type: false`);
        }

        let isNearRequiredness = false;
        if (requiredness) {
            if (position.character >= requirednessStart - proximity && position.character <= requirednessEnd + proximity) {
                isNearRequiredness = true;
                console.log(`Is near requiredness: true`);
            } else {
                console.log(`Is near requiredness: false`);
            }
        }

        console.log(`\nDecision Logic:`);
        if (isNearType && isNearRequiredness) {
            console.log(`Near both type and requiredness`);
            if (minDistanceToType <= minDistanceToRequiredness) {
                console.log(`Min distance to type (${minDistanceToType}) <= min distance to requiredness (${minDistanceToRequiredness})`);
                console.log(`RESULT: Should select type "i32"`);
            } else {
                console.log(`Min distance to type (${minDistanceToType}) > min distance to requiredness (${minDistanceToRequiredness})`);
                console.log(`RESULT: Should select requiredness "required"`);
            }
        } else if (isNearType) {
            console.log(`Near type only`);
            console.log(`RESULT: Should select type "i32"`);
        } else if (isNearRequiredness) {
            console.log(`Near requiredness only`);
            console.log(`RESULT: Should select requiredness "required"`);
        } else {
            console.log(`Not near either type or requiredness`);
            console.log(`RESULT: No selection`);
        }
    }

    console.log('\n--- Actual Provider Behavior ---');
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

    console.log(`Actual selected text: "${selectedText}"`);
    console.log(`Range: [${firstRange.range.start.line}, ${firstRange.range.start.character}] to [${firstRange.range.end.line}, ${firstRange.range.end.character}]`);

    // Print the hierarchy
    let current = firstRange;
    let level = 0;
    console.log('\nHierarchy:');
    while (current) {
        const rangeText = getRangeText(text, current.range);
        console.log(`Level ${level}: "${rangeText}"`);
        current = current.parent;
        level++;
    }
}

debugTypeReferenceSelection().catch((error) => {
    console.error('Debug test failed:', error);
    process.exit(1);
});