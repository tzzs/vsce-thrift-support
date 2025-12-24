// Simple mock for vscode
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

// Mock the selection range provider
class ThriftSelectionRangeProvider {
    getSelectionRangesForPosition(document, position) {
        const ranges = [];
        const text = document.getText();
        const lines = text.split('\n');
        const currentLine = lines[position.line];

        console.log('Current line:', JSON.stringify(currentLine));
        console.log('Position:', position.line, position.character);

        // Field definitions - check these first for more precise type detection
        const fieldMatch = currentLine.match(/^(\s*)(\d+)\s*:\s*((?:required|optional)\s+)?([^\s,]+(?:\s*<[^>]+>\s*)?)\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?:=\s*([^,;]+))?\s*[,;]?/);
        if (fieldMatch) {
            console.log('Field match found:', fieldMatch);
            
            const fullField = fieldMatch[0];
            const fieldIndex = currentLine.indexOf(fullField);
            console.log('Full field:', JSON.stringify(fullField));
            console.log('Field index:', fieldIndex);
            
            if (fieldIndex >= 0 && position.character >= fieldIndex && position.character <= fieldIndex + fullField.length) {
                // Extract parts with their positions
                const fieldId = fieldMatch[2];
                const requiredness = fieldMatch[3]; // Could be "required " or "optional " or undefined
                const fieldTypeWithModifiers = fieldMatch[4];
                const fieldName = fieldMatch[5];

                console.log('Field components:');
                console.log('  Field ID:', fieldId);
                console.log('  Requiredness:', requiredness);
                console.log('  Field type:', fieldTypeWithModifiers);
                console.log('  Field name:', fieldName);

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

                console.log('Position after field ID and colon:', currentIndex);

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

                console.log('Type range:', typeRange);
                console.log('Requiredness range:', requirednessRange);

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

                console.log('Position analysis:');
                console.log('  Is near type:', isNearType);
                console.log('  Is near requiredness:', isNearRequiredness);
                console.log('  Is just after requiredness:', isJustAfterRequiredness);
                console.log('  Is between requiredness and type:', isBetweenRequirednessAndType);
                console.log('  Min distance to type:', minDistanceToType);
                console.log('  Min distance to requiredness:', minDistanceToRequiredness);

                // Prioritize type over requiredness when position is near both or between them
                let fieldComponentSelected = false;
                if (isNearType && isNearRequiredness) {
                    if (position.character >= fieldTypeStart && position.character <= fieldTypeEnd) {
                        if (typeRange) {
                            console.log('Adding type range (exactly on type)');
                            this.addRangeIfLarger(ranges, typeRange);
                            fieldComponentSelected = true;
                        }
                    } else if (minDistanceToType <= minDistanceToRequiredness || isJustAfterRequiredness) {
                        if (typeRange) {
                            console.log('Adding type range (closer or just after requiredness)');
                            this.addRangeIfLarger(ranges, typeRange);
                            fieldComponentSelected = true;
                        }
                    } else if (requirednessRange) {
                        console.log('Adding requiredness range');
                        this.addRangeIfLarger(ranges, requirednessRange);
                        fieldComponentSelected = true;
                    }
                } else if (isNearType || isJustAfterRequiredness || isBetweenRequirednessAndType) {
                    if (typeRange) {
                        console.log('Adding type range (only near type or just after requiredness)');
                        this.addRangeIfLarger(ranges, typeRange);
                        fieldComponentSelected = true;
                    }
                } else if (isNearRequiredness && requirednessRange) {
                    console.log('Adding requiredness range (only near requiredness)');
                    this.addRangeIfLarger(ranges, requirednessRange);
                    fieldComponentSelected = true;
                }

                console.log('Field component selected:', fieldComponentSelected);

                // If we've selected a field component, add the full field range as parent and return early
                if (fieldComponentSelected) {
                    // Add the full field range as the parent of the component range
                    const fieldRange = new vscode.Range(position.line, fieldIndex, position.line, fieldIndex + fullField.length);
                    console.log('Adding full field range as parent');
                    this.addRangeIfLarger(ranges, fieldRange);
                    
                    // Return early to prevent general type reference matching from overriding our selection
                    console.log('Returning early with ranges:', ranges.map(r => ({ 
                        start: r.range.start.character, 
                        end: r.range.end.character, 
                        text: currentLine.substring(r.range.start.character, r.range.end.character) 
                    })));
                    return ranges;
                }

                console.log('No field component selected, continuing with general logic');
            }
        }

        // If no syntactic units found, try word selection
        if (ranges.length === 0) {
            const wordRange = document.getWordRangeAtPosition(position);
            if (wordRange) {
                console.log('Adding word range:', wordRange);
                ranges.push(new vscode.SelectionRange(wordRange));
            }
        }

        console.log('Final ranges:', ranges.map(r => ({ 
            start: r.range.start.character, 
            end: r.range.end.character, 
            text: currentLine.substring(r.range.start.character, r.range.end.character) 
        })));
        return ranges;
    }

    addRangeIfLarger(ranges, newRange) {
        console.log('addRangeIfLarger called with:', { 
            newRange: { start: newRange.start.character, end: newRange.end.character }, 
            existingRanges: ranges.map(r => ({ start: r.range.start.character, end: r.range.end.character })) 
        });
        // Check if this range is larger than the last one
        if (ranges.length === 0 || this.isRangeLarger(newRange, ranges[ranges.length - 1].range)) {
            console.log('Adding range - larger than previous');
            // Create a linked list of selection ranges
            const newSelectionRange = new vscode.SelectionRange(newRange);
            if (ranges.length > 0) {
                newSelectionRange.parent = ranges[ranges.length - 1];
            }
            ranges.push(newSelectionRange);
        } else {
            console.log('NOT adding range - not larger than previous');
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
        
        console.log('Comparing ranges:', { 
            range1: { start: range1.start.character, end: range1.end.character }, 
            range2: { start: range2.start.character, end: range2.end.character }, 
            chars1, chars2, larger: chars1 > chars2 
        });
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

console.log('Testing SelectionRangeProvider...');
const provider = new ThriftSelectionRangeProvider();
const ranges = provider.getSelectionRangesForPosition(document, position);

if (ranges.length > 0) {
    const firstRange = ranges[0];
    const selectedText = document.getText().split('\n')[position.line].substring(
        firstRange.range.start.character, 
        firstRange.range.end.character
    );
    console.log('Selected text:', JSON.stringify(selectedText));
    console.log('Expected: "i32"');
    console.log('Test result:', selectedText === 'i32' ? 'PASS' : 'FAIL');
} else {
    console.log('No ranges found');
}