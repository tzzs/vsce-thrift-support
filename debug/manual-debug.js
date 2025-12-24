// Manual debugging to understand the field parsing logic

function createMockDocument(text) {
    return {
        getText: () => text,
        lineAt: (line) => {
            const lines = text.split('\n');
            return {
                text: lines[line] || '',
                lineNumber: line
            };
        }
    };
}

function getRangeText(text, range) {
    const lines = text.split('\n');
    const line = lines[range.start.line];
    return line.substring(range.start.character, range.end.character);
}

function debugFieldParsing() {
    console.log('Debugging field parsing logic...');

    const text = `struct User {
  1: required i32 id,
  2: optional string name
}`;
    
    const document = createMockDocument(text);
    const position = { line: 1, character: 13 }; // On space between "required" and "i32"
    
    console.log(`Position: line ${position.line}, character ${position.character}`);
    console.log(`Character at position: '${text.split('\n')[1][13]}'`);
    console.log(`Full line: '${text.split('\n')[1]}'`);

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
            
            // Check proximity logic
            const proximity = 2;
            const isNearType = position.character >= typeRange.start - proximity && position.character <= typeRange.end + proximity;
            const isNearRequiredness = position.character >= requirednessRange.start - proximity && position.character <= requirednessRange.end + proximity;
            
            console.log(`\nProximity checks:`);
            console.log(`Is near type: ${isNearType}`);
            console.log(`Is near requiredness: ${isNearRequiredness}`);
            
            // Check special conditions
            const isJustAfterRequiredness = position.character >= requirednessRange.end && position.character <= requirednessRange.end + 2;
            const isBetweenRequirednessAndType = position.character >= requirednessRange.end && position.character < typeRange.start;
            
            console.log(`Is just after requiredness: ${isJustAfterRequiredness}`);
            console.log(`Is between requiredness and type: ${isBetweenRequirednessAndType}`);
            
            // Check selection logic
            let fieldComponentSelected = false;
            if (isNearType && isNearRequiredness) {
                console.log(`Both near type and requiredness - checking distances...`);
                const distanceToTypeStart = Math.abs(position.character - typeRange.start);
                const distanceToTypeEnd = Math.abs(position.character - typeRange.end);
                const minDistanceToType = Math.min(distanceToTypeStart, distanceToTypeEnd);
                
                const distanceToRequirednessStart = Math.abs(position.character - requirednessRange.start);
                const distanceToRequirednessEnd = Math.abs(position.character - requirednessRange.end);
                const minDistanceToRequiredness = Math.min(distanceToRequirednessStart, distanceToRequirednessEnd);
                
                console.log(`Min distance to type: ${minDistanceToType}`);
                console.log(`Min distance to requiredness: ${minDistanceToRequiredness}`);
                
                if (minDistanceToType <= minDistanceToRequiredness || isJustAfterRequiredness) {
                    console.log(`Would select TYPE (distance or just after)`);
                    fieldComponentSelected = true;
                } else {
                    console.log(`Would select REQUIREDNESS`);
                    fieldComponentSelected = true;
                }
            } else if (isNearType || isJustAfterRequiredness || isBetweenRequirednessAndType) {
                console.log(`Would select TYPE (near type, just after requiredness, or between)`);
                fieldComponentSelected = true;
            } else if (isNearRequiredness) {
                console.log(`Would select REQUIREDNESS (only near requiredness)`);
                fieldComponentSelected = true;
            } else {
                console.log(`No field component selected - would fall back to general matching`);
            }
            
            console.log(`\nFinal result: fieldComponentSelected = ${fieldComponentSelected}`);
        }
    }
}

debugFieldParsing();