// Manual test to debug the selection range provider issue

const text = `struct User {
  1: required i32 id,
  2: optional string name
}`;

console.log('Test text:');
console.log(text);
console.log('');

// Simulate the position from the test
const lineIndex = 1;
const positionChar = 13; // On space between "required" and "i32"

console.log(`Position: line=${lineIndex}, character=${positionChar}`);

const lines = text.split('\n');
const currentLine = lines[lineIndex];
console.log(`Current line: "${currentLine}"`);
console.log(`Character at position: "${currentLine[positionChar] || 'EOF'}"`);

// Apply the field regex
const fieldRegex = /^(\s*)(\d+)\s*:\s*((?:required|optional)\s+)?([^\s,]+(?:\s*<[^>]+>\s*)?)\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?:=\s*([^,;]+))?\s*[,;]?/;
const fieldMatch = currentLine.match(fieldRegex);

if (fieldMatch) {
    console.log('\nField match found:');
    console.log('Full match:', fieldMatch[0]);
    console.log('Field ID:', fieldMatch[2]);
    console.log('Requiredness:', fieldMatch[3]);
    console.log('Type:', fieldMatch[4]);
    console.log('Name:', fieldMatch[5]);

    const fullField = fieldMatch[0];
    const fieldIndex = currentLine.indexOf(fullField);
    console.log(`\nFull field: "${fullField}"`);
    console.log(`Field index: ${fieldIndex}`);
    console.log(`Position in field range: ${positionChar >= fieldIndex && positionChar <= fieldIndex + fullField.length}`);

    // Calculate positions
    const fieldId = fieldMatch[2];
    const requiredness = fieldMatch[3];
    const fieldTypeWithModifiers = fieldMatch[4];
    const fieldName = fieldMatch[5];

    let currentIndex = fieldIndex;

    // Skip leading whitespace
    while (currentIndex < fieldIndex + fullField.length && /\s/.test(currentLine[currentIndex])) {
        currentIndex++;
    }
    console.log(`\nAfter skipping leading whitespace, currentIndex: ${currentIndex}`);

    // Skip field ID and colon
    currentIndex += fieldId.length + 1; // +1 for colon
    console.log(`After skipping field ID and colon, currentIndex: ${currentIndex}`);

    // Skip whitespace after colon
    while (currentIndex < fieldIndex + fullField.length && /\s/.test(currentLine[currentIndex])) {
        currentIndex++;
    }
    console.log(`After skipping whitespace after colon, currentIndex: ${currentIndex}`);

    // Handle requiredness
    let requirednessRange = null;
    let fieldTypeStart = currentIndex;
    let fieldTypeEnd = fieldTypeStart;

    if (requiredness) {
        const requirednessStart = currentIndex;
        const requirednessEnd = currentIndex + requiredness.length;
        requirednessRange = {start: requirednessStart, end: requirednessEnd};

        console.log(`\nRequiredness: "${requiredness}"`);
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
        fieldTypeEnd = fieldTypeStart + fieldTypeWithModifiers.length;
        console.log(`Type start: ${fieldTypeStart}`);
        console.log(`Type end: ${fieldTypeEnd}`);
        console.log(`Type: "${currentLine.substring(fieldTypeStart, fieldTypeEnd)}"`);
    }

    // Check distances
    const distanceToFieldTypeStart = Math.abs(positionChar - fieldTypeStart);
    const distanceToFieldTypeEnd = Math.abs(positionChar - fieldTypeEnd);
    const minDistanceToType = Math.min(distanceToFieldTypeStart, distanceToFieldTypeEnd);

    console.log(`\nDistance calculations:`);
    console.log(`Position: ${positionChar}`);
    console.log(`Distance to type start (${fieldTypeStart}): ${distanceToFieldTypeStart}`);
    console.log(`Distance to type end (${fieldTypeEnd}): ${distanceToFieldTypeEnd}`);
    console.log(`Min distance to type: ${minDistanceToType}`);

    if (requirednessRange) {
        const requirednessStart = requirednessRange.start;
        const requirednessEnd = requirednessRange.end;
        const distanceToRequirednessStart = Math.abs(positionChar - requirednessStart);
        const distanceToRequirednessEnd = Math.abs(positionChar - requirednessEnd);
        const minDistanceToRequiredness = Math.min(distanceToRequirednessStart, distanceToRequirednessEnd);

        console.log(`\nRequiredness distances:`);
        console.log(`Distance to requiredness start (${requirednessStart}): ${distanceToRequirednessStart}`);
        console.log(`Distance to requiredness end (${requirednessEnd}): ${distanceToRequirednessEnd}`);
        console.log(`Min distance to requiredness: ${minDistanceToRequiredness}`);

        // Special check for position just after requiredness
        const isJustAfterRequiredness = positionChar >= requirednessEnd && positionChar <= requirednessEnd + 2;
        console.log(`\nIs just after requiredness: ${isJustAfterRequiredness}`);

        // Decision logic
        const isNearType = positionChar >= fieldTypeStart - 2 && positionChar <= fieldTypeEnd + 2;
        const isNearRequiredness = positionChar >= requirednessStart - 2 && positionChar <= requirednessEnd + 2;

        console.log(`\nProximity checks:`);
        console.log(`Is near type: ${isNearType}`);
        console.log(`Is near requiredness: ${isNearRequiredness}`);

        if (isNearType && isNearRequiredness) {
            console.log(`\nBoth near - comparing distances:`);
            console.log(`minDistanceToType (${minDistanceToType}) <= minDistanceToRequiredness (${minDistanceToRequiredness}) OR isJustAfterRequiredness (${isJustAfterRequiredness})`);
            if (minDistanceToType <= minDistanceToRequiredness || isJustAfterRequiredness) {
                console.log(`=> SELECT TYPE: "${currentLine.substring(fieldTypeStart, fieldTypeEnd)}"`);
            } else {
                console.log(`=> SELECT REQUIREDNESS: "${currentLine.substring(requirednessStart, requirednessEnd)}"`);
            }
        } else if (isNearType || isJustAfterRequiredness) {
            console.log(`\nNear type or just after requiredness:`);
            console.log(`=> SELECT TYPE: "${currentLine.substring(fieldTypeStart, fieldTypeEnd)}"`);
        } else if (isNearRequiredness) {
            console.log(`\nNear requiredness:`);
            console.log(`=> SELECT REQUIREDNESS: "${currentLine.substring(requirednessStart, requirednessEnd)}"`);
        } else {
            console.log(`\nNot near anything specific`);
        }
    }
} else {
    console.log('No field match found');
}