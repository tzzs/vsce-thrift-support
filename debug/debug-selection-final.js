const fs = require('fs');
const path = require('path');

// Mock VS Code classes
class Position {
    constructor(line, character) {
        this.line = line;
        this.character = character;
    }
}

class Range {
    constructor(startLine, startChar, endLine, endChar) {
        this.start = new Position(startLine, startChar);
        this.end = new Position(endLine, endChar);
    }
}

// Load the actual selection range provider
const selectionRangeProviderPath = path.resolve(__dirname, 'out/src/selectionRangeProvider.js');
const {ThriftSelectionRangeProvider} = require(selectionRangeProviderPath);

// Mock document
function createMockDocument(text) {
    return {
        getText: () => text,
        lineAt: (line) => ({
            text: text.split('\n')[line]
        })
    };
}

async function debugFinalIssue() {
    console.log('=== Final Debug: Type Reference Selection Issue ===\n');

    const provider = new ThriftSelectionRangeProvider();
    const text = `struct User {
  1: required i32 id,
  2: optional string name
}`;

    const document = createMockDocument(text);
    const position = new Position(1, 13); // On space between "required" and "i32"

    console.log('Test text:');
    console.log(text);
    console.log('');
    console.log(`Position: line=${position.line}, character=${position.character}`);

    // Get the line text
    const lineText = document.lineAt(position.line).text;
    console.log(`Line text: "${lineText}"`);
    console.log(`Character at position: "${lineText[position.character] || 'EOF'}"`);
    console.log('');

    // Manually analyze the line
    console.log('Manual Line Analysis:');
    console.log(`Full line length: ${lineText.length}`);

    // Find positions of key elements
    const requiredIndex = lineText.indexOf('required');
    const i32Index = lineText.indexOf('i32');
    const idIndex = lineText.indexOf('id');

    console.log(`"required" starts at: ${requiredIndex}`);
    console.log(`"i32" starts at: ${i32Index}`);
    console.log(`"id" starts at: ${idIndex}`);

    console.log(`Position ${position.character} is:`);
    console.log(`- ${position.character - requiredIndex} characters after "required" start`);
    console.log(`- ${i32Index - position.character} characters before "i32" start`);
    console.log('');

    // Try to understand what the provider is doing
    console.log('Calling provider.provideSelectionRanges...');

    try {
        const selectionRanges = await provider.provideSelectionRanges(
            document,
            [position],
            {isCancellationRequested: false}
        );

        console.log(`Returned ${selectionRanges.length} selection ranges`);

        if (selectionRanges.length > 0) {
            const range = selectionRanges[0];
            console.log(`First range: Line ${range.start.line}, Char ${range.start.character} to Line ${range.end.line}, Char ${range.end.character}`);

            // Extract the text for this range
            const lines = text.split('\n');
            if (range.start.line === range.end.line) {
                const selectedText = lines[range.start.line].substring(range.start.character, range.end.character);
                console.log(`Selected text: "${selectedText}"`);
            }
        }
    } catch (error) {
        console.error('Error calling provider:', error);
    }
}

debugFinalIssue().catch(console.error);