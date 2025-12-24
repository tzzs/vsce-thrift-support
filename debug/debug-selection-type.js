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

// Test the current regex matching
function testRegexMatching() {
    console.log('=== Testing Regex Matching ===\n');

    const text = `struct User {
  1: required i32 id,
  2: optional string name
}`;

    console.log('Test text:');
    console.log(text);
    console.log('');

    const lines = text.split('\n');
    const currentLine = lines[1]; // "  1: required i32 id,"
    console.log('Current line:', currentLine);
    console.log('');

    // Current regex pattern
    const typeRefMatch = currentLine.match(/([A-Za-z_][A-Za-z0-9_]*(?:\s*<[^>]+>)?)/g);
    console.log('Matches with current regex:', typeRefMatch);
    console.log('');

    // Position is at character 13 (should be "i32")
    const positionChar = 13;
    console.log('Position character:', positionChar);
    console.log('');

    // Check which matches contain the position
    if (typeRefMatch) {
        for (const typeRef of typeRefMatch) {
            const index = currentLine.indexOf(typeRef);
            console.log(`Checking "${typeRef}" at index ${index}:`);
            console.log(`  Range: ${index} to ${index + typeRef.length}`);
            console.log(`  Position ${positionChar} inside range: ${positionChar >= index && positionChar <= index + typeRef.length}`);
            console.log('');
        }
    }

    // Better regex that looks for types after "required" or "optional"
    console.log('=== Testing Improved Regex ===\n');
    const betterTypeRefMatch = currentLine.match(/(?:required|optional)?\s*([A-Za-z_][A-Za-z0-9_]*(?:\s*<[^>]+>)?)/g);
    console.log('Matches with improved regex:', betterTypeRefMatch);

    if (betterTypeRefMatch) {
        for (const match of betterTypeRefMatch) {
            const index = currentLine.indexOf(match);
            console.log(`Full match "${match}" at index ${index}`);

            // Extract just the type part
            const typeMatch = match.match(/(?:required|optional)?\s*([A-Za-z_][A-Za-z0-9_]*(?:\s*<[^>]+>)?)/);
            if (typeMatch && typeMatch[1]) {
                const typePart = typeMatch[1];
                const typeIndex = currentLine.indexOf(typePart, index);
                console.log(`  Type part: "${typePart}" at index ${typeIndex}`);
                console.log(`  Position ${positionChar} inside type range: ${positionChar >= typeIndex && positionChar <= typeIndex + typePart.length}`);
            }
            console.log('');
        }
    }
}

testRegexMatching();