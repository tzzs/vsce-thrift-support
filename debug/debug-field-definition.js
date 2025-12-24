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

        toString() {
            return `[${this.start.line},${this.start.character} -> ${this.end.line},${this.end.character}]`;
        }
    }
};

// Mock document implementation
function createMockDocument(text) {
    return {
        getText: () => text,
        getWordRangeAtPosition: (position) => {
            const lines = text.split('\n');
            const line = lines[position.line];
            if (!line) return null;

            // Simple word detection
            const wordRegex = /[A-Za-z_][A-Za-z0-9_]*/g;
            let match;
            while ((match = wordRegex.exec(line)) !== null) {
                if (position.character >= match.index && position.character <= match.index + match[0].length) {
                    return new vscode.Range(
                        position.line, match.index,
                        position.line, match.index + match[0].length
                    );
                }
            }
            return null;
        }
    };
}

// Mock position
function createMockPosition(line, character) {
    return {line, character};
}

// Test field definition matching
function testFieldDefinitionMatching() {
    console.log('=== Testing Field Definition Matching ===\n');

    const text = `struct User {
  1: required i32 id,
  2: optional string name
}`;

    console.log('Test text:');
    console.log(text);
    console.log('');

    const lines = text.split('\n');
    const currentLine = lines[1]; // "  1: required i32 id,"
    console.log('Current line:', JSON.stringify(currentLine));
    console.log('');

    // Field definition regex
    const fieldMatch = currentLine.match(/^(\s*)(\d+)\s*:\s*(?:required|optional)?\s*([^\s,]+(?:\s*<[^>]+>\s*)?)\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?:=\s*([^,;]+))?\s*[,;]?/);
    console.log('Field match result:', fieldMatch);
    console.log('');

    if (fieldMatch) {
        console.log('Field match groups:');
        fieldMatch.forEach((group, index) => {
            console.log(`  [${index}]: ${JSON.stringify(group)}`);
        });
        console.log('');

        // Extract parts
        const fieldType = fieldMatch[3];  // Type part
        const fieldName = fieldMatch[4];  // Name part

        console.log('Field type:', JSON.stringify(fieldType));
        console.log('Field name:', JSON.stringify(fieldName));
        console.log('');

        // Find positions
        const typeIndex = currentLine.indexOf(fieldType);
        const nameIndex = currentLine.indexOf(fieldName);

        console.log('Type position:', typeIndex);
        console.log('Name position:', nameIndex);
        console.log('');

        // Position is at character 13 (should be "i32")
        const positionChar = 13;
        console.log('Position character:', positionChar);
        console.log('');

        console.log(`Is position ${positionChar} in type range (${typeIndex}-${typeIndex + fieldType.length}):`,
            positionChar >= typeIndex && positionChar < typeIndex + fieldType.length);
        console.log(`Is position ${positionChar} in name range (${nameIndex}-${nameIndex + fieldName.length}):`,
            positionChar >= nameIndex && positionChar < nameIndex + fieldName.length);
    }
}

testFieldDefinitionMatching();