// Mock vscode module
const mockVSCode = {
    Range: function(startLine, startChar, endLine, endChar) {
        this.start = { line: startLine, character: startChar };
        this.end = { line: endLine, character: endChar };
    },
    SelectionRange: function(range) {
        this.range = range;
        this.parent = null;
    }
};

// Mock require
const Module = require('module');
const originalRequire = Module.prototype.require;
Module.prototype.require = function(id) {
    if (id === 'vscode') {
        return mockVSCode;
    }
    return originalRequire.apply(this, arguments);
};

function createMockDocument(text) {
    return {
        getText: function(range) {
            if (!range) return text;
            const lines = text.split('\n');
            let result = '';
            for (let i = range.start.line; i <= range.end.line; i++) {
                if (i >= 0 && i < lines.length) {
                    const line = lines[i];
                    if (i === range.start.line && i === range.end.line) {
                        result += line.substring(range.start.character, range.end.character);
                    } else if (i === range.start.line) {
                        result += line.substring(range.start.character);
                    } else if (i === range.end.line) {
                        result += line.substring(0, range.end.character);
                    } else {
                        result += line;
                    }
                    if (i < range.end.line) result += '\n';
                }
            }
            return result;
        },
        positionAt: function(offset) {
            let currentOffset = 0;
            const lines = text.split('\n');
            for (let i = 0; i < lines.length; i++) {
                const lineLength = lines[i].length + 1; // +1 for newline
                if (currentOffset + lineLength > offset) {
                    return { line: i, character: offset - currentOffset };
                }
                currentOffset += lineLength;
            }
            return { line: lines.length - 1, character: lines[lines.length - 1].length };
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

function countSelectionRanges(selectionRange) {
    let count = 1;
    let current = selectionRange;
    while (current.parent) {
        count++;
        current = current.parent;
    }
    return count;
}

function getRangeText(text, range) {
    const lines = text.split('\n');
    let result = '';
    for (let i = range.start.line; i <= range.end.line; i++) {
        if (i >= 0 && i < lines.length) {
            const line = lines[i];
            if (i === range.start.line && i === range.end.line) {
                result += line.substring(range.start.character, range.end.character);
            } else if (i === range.start.line) {
                result += line.substring(range.start.character);
            } else if (i === range.end.line) {
                result += line.substring(0, range.end.character);
            } else {
                result += line;
            }
            if (i < range.end.line) result += '\n';
        }
    }
    return result;
}

async function debugHierarchicalSelection() {
    console.log('Debugging hierarchical selection...');

    const text = `struct User {
  1: required i32 id,
  2: optional string name
}`;
    const lines = text.split('\n');
    console.log('Lines:');
    lines.forEach((line, i) => console.log(`  ${i}: "${line}"`));
    
    // Simulate the findContainingTypeDefinition method logic
    console.log('\nTesting findContainingTypeDefinition...');
    
    const position = { line: 1, character: 18 }; // On "id"
    let typeStart = -1;
    let braceDepth = 0;
    let foundStart = false;
    let containingType = null;

    // First, find the type definition that contains this line
    for (let i = Math.max(0, position.line - 20); i <= position.line; i++) {
        const line = lines[i].trim();
        console.log(`Checking line ${i}: "${line}"`);

        if (line.match(/^(struct|union|exception|enum|senum|service)\s+\w+/)) {
            typeStart = i;
            foundStart = true;
            console.log(`Found type definition at line ${i}`);
        }
    }

    if (typeStart !== -1) {
        // Reset brace depth for finding the closing brace
        braceDepth = 0;
        
        // Find the closing brace starting from the type definition
        for (let i = typeStart; i < lines.length; i++) {
            const line = lines[i];
            console.log(`Finding closing brace at line ${i}: "${line}"`);

            for (let j = 0; j < line.length; j++) {
                if (line[j] === '{') {
                    braceDepth++;
                    console.log(`  Found '{', braceDepth = ${braceDepth}`);
                } else if (line[j] === '}') {
                    braceDepth--;
                    console.log(`  Found '}', braceDepth = ${braceDepth}`);
                    if (braceDepth === 0) {
                        containingType = {start: typeStart, end: i};
                        console.log(`Found closing brace: start=${typeStart}, end=${i}`);
                        break;
                    }
                }
            }
            if (containingType) break;
        }
    }

    console.log(`Final containing type: ${JSON.stringify(containingType)}`);
    
    if (containingType) {
        const typeRange = new mockVSCode.Range(containingType.start, 0, containingType.end, lines[containingType.end].length);
        console.log(`Type range: [${typeRange.start.line}:${typeRange.start.character}-${typeRange.end.line}:${typeRange.end.character}]`);
        console.log(`Type range text: "${getRangeText(text, typeRange)}"`);
    }
}

debugHierarchicalSelection().catch(console.error);