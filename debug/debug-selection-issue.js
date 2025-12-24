const { ThriftSelectionRangeProvider } = require('./out/src/selectionRangeProvider');

function createMockDocument(text) {
    return {
        getText: () => text,
        lineAt: (line) => {
            const lines = text.split('\n');
            return {
                text: lines[line] || '',
                lineNumber: line
            };
        },
        positionAt: (offset) => {
            const lines = text.split('\n');
            let currentOffset = 0;
            for (let i = 0; i < lines.length; i++) {
                if (currentOffset + lines[i].length >= offset) {
                    return { line: i, character: offset - currentOffset };
                }
                currentOffset += lines[i].length + 1; // +1 for newline
            }
            return { line: lines.length - 1, character: lines[lines.length - 1].length };
        }
    };
}

function createMockPosition(line, character) {
    return { line, character };
}

function createMockCancellationToken() {
    return { isCancellationRequested: false };
}

function getRangeText(text, range) {
    const lines = text.split('\n');
    const line = lines[range.start.line];
    return line.substring(range.start.character, range.end.character);
}

async function debugSelectionIssue() {
    console.log('Debugging selection issue...');

    const provider = new ThriftSelectionRangeProvider();
    const text = `struct User {
  1: required i32 id,
  2: optional string name
}`;
    const document = createMockDocument(text);
    const position = createMockPosition(1, 13); // On space between "required" and "i32"
    
    console.log(`Position: line ${position.line}, character ${position.character}`);
    console.log(`Character at position: '${text.split('\n')[1][13]}'`);
    console.log(`Full line: '${text.split('\n')[1]}'`);
    console.log(`Line length: ${text.split('\n')[1].length}`);

    // Let's manually parse the field to understand the issue
    const currentLine = text.split('\n')[1];
    const fieldMatch = currentLine.match(/^(\s*)(\d+):\s*(required|optional)?\s*([A-Za-z_][A-Za-z0-9_]*(?:\s*<[^>]+>)?)\s+([A-Za-z_][A-Za-z0-9_]*)\s*,?$/);
    
    if (fieldMatch) {
        const [, , , requiredness, fieldTypeWithModifiers, fieldName] = fieldMatch;
        const fieldIndex = currentLine.indexOf(fieldMatch[0]);
        
        console.log(`\nField parsing results:`);
        console.log(`Full field: "${fieldMatch[0]}"`);
        console.log(`Requiredness: "${requiredness}"`);
        console.log(`Field type: "${fieldTypeWithModifiers}"`);
        console.log(`Field name: "${fieldName}"`);
        console.log(`Field starts at: ${fieldIndex}`);
        
        // Calculate positions
        let currentIndex = fieldIndex;
        let requirednessRange = null;
        let typeRange = null;
        
        if (requiredness) {
            const requirednessStart = currentIndex + currentLine.substring(fieldIndex).indexOf(requiredness);
            const requirednessEnd = requirednessStart + requiredness.length;
            requirednessRange = { start: requirednessStart, end: requirednessEnd };
            
            currentIndex = requirednessEnd;
            
            // Skip whitespace after requiredness
            while (currentIndex < currentLine.length && /\s/.test(currentLine[currentIndex])) {
                currentIndex++;
            }
            
            const typeStart = currentIndex;
            const typeEnd = typeStart + fieldTypeWithModifiers.length;
            typeRange = { start: typeStart, end: typeEnd };
            
            console.log(`Requiredness range: [${requirednessRange.start}, ${requirednessRange.end}]`);
            console.log(`Type range: [${typeRange.start}, ${typeRange.end}]`);
            console.log(`Position 13 is between requiredness end (${requirednessRange.end}) and type start (${typeRange.start}): ${position.character >= requirednessRange.end && position.character < typeRange.start}`);
        }
    }

    const selectionRanges = await provider.provideSelectionRanges(
        document,
        [position],
        createMockCancellationToken()
    );

    if (!Array.isArray(selectionRanges)) {
        console.log('No selection ranges returned');
        return;
    }

    console.log(`\nFound ${selectionRanges.length} selection ranges`);
    for (let i = 0; i < selectionRanges.length; i++) {
        const range = selectionRanges[i].range;
        const selectedText = getRangeText(text, range);
        console.log(`Range ${i}: [${range.start.line}:${range.start.character} - ${range.end.line}:${range.end.character}]`);
        console.log(`Selected text: "${selectedText}"`);
    }
}

debugSelectionIssue().catch(console.error);