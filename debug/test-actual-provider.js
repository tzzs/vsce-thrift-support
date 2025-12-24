// Test the actual provider logic
const vscode = {
    Range: class Range {
        constructor(startLine, startChar, endLine, endChar) {
            this.start = { line: startLine, character: startChar };
            this.end = { line: endLine, character: endChar };
        }
    },
    Position: class Position {
        constructor(line, character) {
            this.line = line;
            this.character = character;
        }
    },
    SelectionRange: class SelectionRange {
        constructor(range) {
            this.range = range;
            this.parent = null;
        }
    }
};

// Mock the selection range provider with the actual logic
class ThriftSelectionRangeProvider {
    provideSelectionRanges(document, positions, token) {
        const ranges = [];

        for (const position of positions) {
            if (token.isCancellationRequested) {
                break;
            }

            const selectionRanges = this.getSelectionRangesForPosition(document, position);
            // Return only the smallest range for each position, with parents forming hierarchy
            if (selectionRanges.length > 0) {
                ranges.push(selectionRanges[0]);
            }
        }

        return ranges;
    }

    getSelectionRangesForPosition(document, position) {
        const ranges = [];
        const text = document.getText();
        const lines = text.split('\n');
        const currentLine = lines[position.line];

        // Field definitions - check these first for more precise type detection
        const fieldMatch = currentLine.match(/^(\s*)(\d+)\s*:\s*((?:required|optional)\s+)?([^\s,]+(?:\s*<[^>]+>\s*)?)\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?:=\s*([^,;]+))?\s*[,;]?/);
        if (fieldMatch) {
            const fullField = fieldMatch[0];
            const fieldIndex = currentLine.indexOf(fullField);
            if (fieldIndex >= 0 && position.character >= fieldIndex && position.character <= fieldIndex + fullField.length) {
                // Extract parts with their positions
                const fieldId = fieldMatch[2];
                const requiredness = fieldMatch[3]; // Could be "required " or "optional " or undefined
                const fieldTypeWithModifiers = fieldMatch[4];
                const fieldName = fieldMatch[5];

                // Calculate precise positions for each component
                let currentIndex = fieldIndex;

                // Skip leading whitespace
                while (currentIndex < fieldIndex + fullField.length && /\s/.test(currentLine[currentIndex])) {
                    currentIndex++;
                }

                // Skip field ID and colon
                currentIndex += fieldId.length + 1; // +1 for colon

                // Skip whitespace after colon
                while (currentIndex < fieldIndex + fullField.length && /\s/.test(currentLine[currentIndex])) {
                    currentIndex++;
                }

                // Initialize type-related variables
                let requirednessRange = null;
                let fieldTypeStart = currentIndex;
                let fieldTypeEnd = fieldTypeStart;
                let typeRange = null;

                // Skip requiredness keyword if present and set type position accordingly
                if (requiredness) {
                    const requirednessStart = currentIndex;
                    const requirednessEnd = currentIndex + requiredness.length;
                    requirednessRange = new vscode.Range(position.line, requirednessStart, position.line, requirednessEnd);

                    currentIndex = requirednessEnd;

                    // Skip whitespace after requiredness
                    while (currentIndex < fieldIndex + fullField.length && /\s/.test(currentLine[currentIndex])) {
                        currentIndex++;
                    }

                    // Set type position after requiredness
                    fieldTypeStart = currentIndex;
                    fieldTypeEnd = fieldTypeStart + fieldTypeWithModifiers.length;
                    typeRange = new vscode.Range(position.line, fieldTypeStart, position.line, fieldTypeEnd);
                } else {
                    // No requiredness keyword, type starts immediately
                    fieldTypeStart = currentIndex;
                    fieldTypeEnd = fieldTypeStart + fieldTypeWithModifiers.length;
                    typeRange = new vscode.Range(position.line, fieldTypeStart, position.line, fieldTypeEnd);
                }

                // Check if position is near the type (with some tolerance for nearby clicks)
                const proximity = 2; // Allow clicking up to 2 characters away
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
                    const requirednessStart = requirednessRange.start.character;
                    const requirednessEnd = requirednessRange.end.character;
                    if (position.character >= requirednessStart - proximity && position.character <= requirednessEnd + proximity) {
                        isNearRequiredness = true;
                        const distanceToRequirednessStart = Math.abs(position.character - requirednessStart);
                        const distanceToRequirednessEnd = Math.abs(position.character - requirednessEnd);
                        minDistanceToRequiredness = Math.min(distanceToRequirednessStart, distanceToRequirednessEnd);
                    }
                }

                // Special handling for positions between requiredness and type
                let isJustAfterRequiredness = false;
                if (requiredness && requirednessRange) {
                    const requirednessEnd = requirednessRange.end.character;
                    if (position.character >= requirednessEnd && position.character <= requirednessEnd + 2) {
                        isJustAfterRequiredness = true;
                    }
                }

                // Additional check for when cursor is between requiredness and type (on whitespace)
                let isBetweenRequirednessAndType = false;
                if (requiredness && requirednessRange && typeRange) {
                    const requirednessEnd = requirednessRange.end.character;
                    const typeStart = typeRange.start.character;
                    if (position.character >= requirednessEnd && position.character < typeStart) {
                        isBetweenRequirednessAndType = true;
                    }
                }

                // Prioritize type over requiredness when position is near both or between them
                let fieldComponentSelected = false;
                if (isNearType && isNearRequiredness) {
                    if (position.character >= fieldTypeStart && position.character <= fieldTypeEnd) {
                        if (typeRange) {
                            this.addRangeIfLarger(ranges, typeRange);
                            fieldComponentSelected = true;
                        }
                    } else if (minDistanceToType <= minDistanceToRequiredness || isJustAfterRequiredness) {
                        if (typeRange) {
                            this.addRangeIfLarger(ranges, typeRange);
                            fieldComponentSelected = true;
                        }
                    } else if (requirednessRange) {
                        this.addRangeIfLarger(ranges, requirednessRange);
                        fieldComponentSelected = true;
                    }
                } else if (isNearType || isJustAfterRequiredness || isBetweenRequirednessAndType) {
                    if (typeRange) {
                        this.addRangeIfLarger(ranges, typeRange);
                        fieldComponentSelected = true;
                    }
                } else if (isNearRequiredness && requirednessRange) {
                    this.addRangeIfLarger(ranges, requirednessRange);
                    fieldComponentSelected = true;
                }

                // If we've selected a field component, add the full field range as parent and return early
                if (fieldComponentSelected) {
                    // Add the full field range as the parent of the component range
                    const fieldRange = new vscode.Range(position.line, fieldIndex, position.line, fieldIndex + fullField.length);
                    this.addRangeIfLarger(ranges, fieldRange);
                    
                    // Return early to prevent general type reference matching from overriding our selection
                    return ranges;
                }

                // No field component selected, add the full field range
                const fieldRange = new vscode.Range(position.line, fieldIndex, position.line, fieldIndex + fullField.length);
                this.addRangeIfLarger(ranges, fieldRange);

                // Return early to prevent general type reference matching from overriding our selection
                return ranges;
            }
        }

        // If no syntactic units found, try word selection
        if (ranges.length === 0) {
            const wordRange = document.getWordRangeAtPosition(position);
            if (wordRange) {
                ranges.push(new vscode.SelectionRange(wordRange));
            }
        }

        return ranges;
    }

    addRangeIfLarger(ranges, newRange) {
        // Check if this range is larger than the last one
        if (ranges.length === 0 || this.isRangeLarger(newRange, ranges[ranges.length - 1].range)) {
            // Create a linked list of selection ranges
            const newSelectionRange = new vscode.SelectionRange(newRange);
            if (ranges.length > 0) {
                newSelectionRange.parent = ranges[ranges.length - 1];
            }
            ranges.push(newSelectionRange);
        }
    }

    isRangeLarger(range1, range2) {
        const lines1 = range1.end.line - range1.start.line;
        const lines2 = range2.end.line - range2.start.line;
        
        if (lines1 > lines2) return true;
        if (lines1 < lines2) return false;
        
        // Same line count, compare character spans
        const chars1 = range1.end.character - range1.start.character;
        const chars2 = range2.end.character - range2.start.character;
        
        return chars1 > chars2;
    }
}

// Create mock document and position
const document = {
    getText: () => `struct User {
  1: required i32 id,
  2: optional string name
}`,
    getWordRangeAtPosition: (position) => {
        const text = document.getText();
        const lines = text.split('\n');
        const currentLine = lines[position.line];
        
        // Simple word boundary detection
        const wordRegex = /[A-Za-z0-9_]+/g;
        let match;
        while ((match = wordRegex.exec(currentLine)) !== null) {
            if (match.index <= position.character && position.character <= match.index + match[0].length) {
                return new vscode.Range(position.line, match.index, position.line, match.index + match[0].length);
            }
        }
        return null;
    }
};

const position = new vscode.Position(1, 13); // On "i32"

console.log('Testing actual provideSelectionRanges method...');
const provider = new ThriftSelectionRangeProvider();
const selectionRanges = provider.provideSelectionRanges(document, [position], {isCancellationRequested: false});

if (selectionRanges.length > 0) {
    const firstRange = selectionRanges[0];
    const selectedText = document.getText().split('\n')[position.line].substring(
        firstRange.range.start.character, 
        firstRange.range.end.character
    );
    console.log('Selected text:', JSON.stringify(selectedText));
    console.log('Expected: "i32"');
    console.log('Test result:', selectedText === 'i32' ? 'PASS' : 'FAIL');
    
    // Check the hierarchy
    let current = firstRange;
    let level = 0;
    while (current) {
        const text = document.getText().split('\n')[position.line].substring(
            current.range.start.character, 
            current.range.end.character
        );
        console.log(`Level ${level}:`, JSON.stringify(text));
        current = current.parent;
        level++;
    }
} else {
    console.log('No ranges found');
}