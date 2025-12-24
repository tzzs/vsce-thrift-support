// Mock VS Code API before importing
const vscode = {
    Range: class {
        constructor(startLine, startChar, endLine, endChar) {
            this.start = { line: startLine, character: startChar };
            this.end = { line: endLine, character: endChar };
        }
    },
    SelectionRange: class {
        constructor(range) {
            this.range = range;
            this.parent = null;
        }
    }
};

// Mock the vscode module before requiring
const Module = require('module');
const originalRequire = Module.prototype.require;
Module.prototype.require = function(id) {
    if (id === 'vscode') {
        return vscode;
    }
    return originalRequire.apply(this, arguments);
};

const { ThriftSelectionRangeProvider } = require('./out/src/selectionRangeProvider');

// Mock document
function createMockDocument(text) {
    return {
        getText: () => text,
        getWordRangeAtPosition: (position) => {
            const lines = text.split('\n');
            const line = lines[position.line];
            const start = position.character;
            const end = position.character;
            
            // Find word boundaries
            let wordStart = start;
            let wordEnd = end;
            
            while (wordStart > 0 && /[A-Za-z0-9_]/.test(line[wordStart - 1])) {
                wordStart--;
            }
            
            while (wordEnd < line.length && /[A-Za-z0-9_]/.test(line[wordEnd])) {
                wordEnd++;
            }
            
            if (wordStart < wordEnd) {
                return new vscode.Range(position.line, wordStart, position.line, wordEnd);
            }
            
            return null;
        }
    };
}

function createMockPosition(line, character) {
    return { line, character };
}

function createMockCancellationToken() {
    return {
        isCancellationRequested: false
    };
}

function getRangeText(text, range) {
    const lines = text.split('\n');
    const startLine = lines[range.start.line];
    return startLine.substring(range.start.character, range.end.character);
}

async function testNamespaceSelection() {
    console.log('=== Testing Namespace Selection with Debug ===');

    const provider = new ThriftSelectionRangeProvider();
    const text = `namespace java com.example.thrift
namespace cpp example.thrift`;
    const document = createMockDocument(text);
    const position = createMockPosition(0, 10); // On "java"

    console.log('Text:', JSON.stringify(text));
    console.log('Position:', position);
    console.log('Line 0:', JSON.stringify(text.split('\n')[0]));
    console.log('Character at position 10:', JSON.stringify(text.split('\n')[0][10]));

    const selectionRanges = await provider.provideSelectionRanges(
        document,
        [position],
        createMockCancellationToken()
    );

    console.log('\nNumber of ranges found:', selectionRanges.length);
    
    if (selectionRanges.length > 0) {
        const firstRange = selectionRanges[0];
        const selectedText = getRangeText(text, firstRange.range);
        console.log(`First range: (${firstRange.range.start.line}, ${firstRange.range.start.character}) to (${firstRange.range.end.line}, ${firstRange.range.end.character}) - "${selectedText}"`);
        
        // Check for parent ranges
        let currentRange = firstRange;
        let level = 0;
        while (currentRange.parent) {
            level++;
            currentRange = currentRange.parent;
            const parentText = getRangeText(text, currentRange.range);
            console.log(`Parent ${level}: (${currentRange.range.start.line}, ${currentRange.range.start.character}) to (${currentRange.range.end.line}, ${currentRange.range.end.character}) - "${parentText}"`);
        }
        
        // Test the expected results
        if (selectedText === 'java') {
            console.log('✅ First level correct: "java" selected');
            
            // Check if there's a parent with the full namespace line
            let hasNamespaceLine = false;
            currentRange = firstRange;
            console.log('Checking for parent ranges...');
            console.log('First range has parent?', !!firstRange.parent);
            while (currentRange.parent) {
                currentRange = currentRange.parent;
                const parentText = getRangeText(text, currentRange.range);
                console.log(`Parent range: "${parentText}"`);
                if (parentText.includes('namespace java com.example.thrift')) {
                    hasNamespaceLine = true;
                    break;
                }
            }
            
            if (hasNamespaceLine) {
                console.log('✅ Parent range test PASSED: Full namespace line found as parent');
            } else {
                console.log('❌ Parent range test FAILED: Full namespace line not found as parent');
            }
        } else {
            console.log(`❌ First level failed: Expected "java", got "${selectedText}"`);
        }
    } else {
        console.log('❌ No ranges found');
    }
}

testNamespaceSelection().catch(console.error);