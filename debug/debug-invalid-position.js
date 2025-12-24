const { ThriftSelectionRangeProvider } = require('./out/src/selectionRangeProvider');

// Mock VS Code API
const vscode = {
    Range: class Range {
        constructor(startLine, startChar, endLine, endChar) {
            this.start = { line: startLine, character: startChar };
            this.end = { line: endLine, character: endChar };
        }
    },
    SelectionRange: class SelectionRange {
        constructor(range) {
            this.range = range;
            this.parent = null;
        }
    },
    Position: class Position {
        constructor(line, character) {
            this.line = line;
            this.character = character;
        }
    }
};

// Mock document
function createMockDocument(text) {
    const lines = text.split('\n');
    return {
        getText: () => text,
        lineAt: (line) => {
            if (line < 0 || line >= lines.length) {
                throw new Error(`Invalid line index: ${line}`);
            }
            return {
                text: lines[line],
                range: new vscode.Range(line, 0, line, lines[line].length)
            };
        },
        getWordRangeAtPosition: (position) => {
            const line = lines[position.line];
            if (!line) return null;
            
            let start = position.character;
            let end = position.character;
            
            // Expand left
            while (start > 0 && /[\w\d_]/.test(line[start - 1])) {
                start--;
            }
            
            // Expand right
            while (end < line.length && /[\w\d_]/.test(line[end])) {
                end++;
            }
            
            if (start < end) {
                return new vscode.Range(position.line, start, position.line, end);
            }
            return null;
        }
    };
}

function createMockPosition(line, character) {
    return new vscode.Position(line, character);
}

function createMockCancellationToken() {
    return {
        isCancellationRequested: false
    };
}

async function debugInvalidPosition() {
    console.log('=== Debugging Invalid Position Test ===');
    
    const provider = new ThriftSelectionRangeProvider();
    const text = `struct User {
  1: required i32 id
}`;
    const document = createMockDocument(text);
    const position = createMockPosition(10, 0); // Beyond document bounds
    
    console.log('Text content:');
    console.log(text);
    console.log(`\nDocument has ${text.split('\n').length} lines`);
    console.log(`Position being tested: (${position.line}, ${position.character})`);
    
    try {
        const selectionRanges = await provider.provideSelectionRanges(
            document,
            [position],
            createMockCancellationToken()
        );
        
        console.log('\nSelection ranges result:');
        console.log(JSON.stringify(selectionRanges, null, 2));
        console.log(`\nFound ${selectionRanges.length} selection ranges at invalid position`);
        console.log('✅ Invalid position test should pass');
        
    } catch (error) {
        console.log('\n❌ Error occurred:');
        console.log(error.message);
        console.log(error.stack);
    }
}

// Run the debug
debugInvalidPosition().catch(console.error);