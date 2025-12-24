const { ThriftSelectionRangeProvider } = require('./out/src/selectionRangeProvider');

function createMockDocument(text) {
    return {
        getText: () => text,
        getTextRange: (range) => {
            const lines = text.split('\n');
            const startLine = lines[range.start.line];
            return startLine.substring(range.start.character, range.end.character);
        },
        getWordRangeAtPosition: (position) => {
            const lines = text.split('\n');
            const currentLine = lines[position.line];
            
            // Simple word detection
            let start = position.character;
            let end = position.character;
            
            // Expand left
            while (start > 0 && /[\w\d_]/.test(currentLine[start - 1])) {
                start--;
            }
            
            // Expand right
            while (end < currentLine.length && /[\w\d_]/.test(currentLine[end])) {
                end++;
            }
            
            if (start < end) {
                return {
                    start: { line: position.line, character: start },
                    end: { line: position.line, character: end }
                };
            }
            return null;
        },
        lineCount: text.split('\n').length
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
    const startLine = lines[range.start.line];
    return startLine.substring(range.start.character, range.end.character);
}

async function debugFieldNameSelection() {
    console.log('=== Debugging Field Name Selection Test ===');
    
    const provider = new ThriftSelectionRangeProvider();
    const text = `struct User {
  1: required i32 id,
  2: optional string name,
  3: required bool active
}`;
    const document = createMockDocument(text);
    const position = createMockPosition(1, 18); // On "id"

    console.log('Text content:');
    console.log(text);
    console.log('\nPosition being tested:');
    const lines = text.split('\n');
    console.log(`Position (1, 18) - Line: "${lines[1]}"`);
    console.log(`Line length: ${lines[1].length}`);
    console.log(`Character at position 18: "${lines[1][18]}"`);
    console.log(`Characters around position 18: "${lines[1].substring(16, 20)}"`);
    
    const wordRange = document.getWordRangeAtPosition(position);
    console.log(`Word range detected: start=${wordRange.start.character}, end=${wordRange.end.character}`);
    console.log(`Word range text: "${getRangeText(text, wordRange)}"`);
    
    const selectionRanges = await provider.provideSelectionRanges(
        document,
        [position],
        createMockCancellationToken()
    );
    
    console.log('\nSelection ranges result:');
    console.log(JSON.stringify(selectionRanges, null, 2));
    
    if (selectionRanges.length > 0) {
        const firstRange = selectionRanges[0];
        const selectedText = getRangeText(text, firstRange.range);
        console.log('\nFirst range selected text:', JSON.stringify(selectedText));
        
        if (selectedText !== 'id') {
            console.log(`❌ Expected 'id', got '${selectedText}'`);
        } else {
            console.log('✅ Correctly selected "id"');
        }
    }
}

// Run the debug function
debugFieldNameSelection().catch(console.error);