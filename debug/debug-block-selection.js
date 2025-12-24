const fs = require('fs');
const path = require('path');
const Module = require('module');

// Mock VS Code API
const mockVSCode = {
    Position: class {
        constructor(line, character) {
            this.line = line;
            this.character = character;
        }
    },
    Range: class {
        constructor(start, end) {
            this.start = start;
            this.end = end;
        }
    },
    SelectionRange: class {
        constructor(range, parent) {
            this.range = range;
            this.parent = parent;
        }
    }
};

// Override require to use our mock
const originalRequire = Module.prototype.require;
Module.prototype.require = function(module) {
    if (module === 'vscode') {
        return mockVSCode;
    }
    return originalRequire.apply(this, arguments);
};

const { ThriftSelectionRangeProvider } = require('./out/src/selectionRangeProvider');

function createMockDocument(text) {
    return {
        getText: function(range) {
            if (!range) return text;
            const lines = text.split('\n');
            const startLine = range.start.line;
            const endLine = range.end.line;
            const startChar = range.start.character;
            const endChar = range.end.character;
            
            if (startLine === endLine) {
                return lines[startLine].substring(startChar, endChar);
            } else {
                let result = lines[startLine].substring(startChar);
                for (let i = startLine + 1; i < endLine; i++) {
                    result += '\n' + lines[i];
                }
                result += '\n' + lines[endLine].substring(0, endChar);
                return result;
            }
        },
        lineCount: text.split('\n').length,
        positionAt: function(offset) {
            const lines = text.split('\n');
            let currentOffset = 0;
            for (let i = 0; i < lines.length; i++) {
                const lineLength = lines[i].length + 1; // +1 for newline
                if (currentOffset + lineLength > offset) {
                    return new mockVSCode.Position(i, offset - currentOffset);
                }
                currentOffset += lineLength;
            }
            return new mockVSCode.Position(lines.length - 1, 0);
        }
    };
}

function createMockPosition(line, character) {
    return new mockVSCode.Position(line, character);
}

function createMockCancellationToken() {
    return {
        isCancellationRequested: false
    };
}

function getRangeText(text, range) {
    if (!range || !range.start || !range.end) {
        console.log('Invalid range:', range);
        return '[INVALID RANGE]';
    }
    
    const lines = text.split('\n');
    const startLine = range.start.line;
    const endLine = range.end.line;
    const startChar = range.start.character;
    const endChar = range.end.character;
    
    if (startLine === endLine) {
        return lines[startLine].substring(startChar, endChar);
    } else {
        let result = lines[startLine].substring(startChar);
        for (let i = startLine + 1; i < endLine; i++) {
            result += '\n' + lines[i];
        }
        result += '\n' + lines[endLine].substring(0, endChar);
        return result;
    }
}

async function debugBlockSelection() {
    console.log('=== Debugging Block Selection Test ===');
    
    const provider = new ThriftSelectionRangeProvider();
    const text = `service UserService {
  User getUser(1: i32 userId),
  void createUser(1: User user)
}`;
    const document = createMockDocument(text);
    const position = createMockPosition(1, 6); // On "getUser"
    
    console.log('Text content:');
    console.log(text);
    console.log('\nPosition being tested:');
    const lines = text.split('\n');
    console.log(`Position (1, 6) - Line: "${lines[1]}" - Character: "${lines[1][6]}"`);
    
    const selectionRanges = await provider.provideSelectionRanges(
        document,
        [position],
        createMockCancellationToken()
    );
    
    if (!Array.isArray(selectionRanges)) {
        throw new Error('Selection ranges not returned as array');
    }
    
    const firstRange = selectionRanges[0];
    
    console.log('\nSelection ranges found:');
    let currentRange = firstRange;
    let level = 0;
    
    while (currentRange) {
        const rangeText = getRangeText(text, currentRange.range);
        console.log(`Level ${level}: "${rangeText}" (lines ${currentRange.range.start.line}-${currentRange.range.end.line})`);
        currentRange = currentRange.parent;
        level++;
    }
    
    // Check if we have the service block range
    currentRange = firstRange;
    let hasBlockRange = false;
    
    while (currentRange.parent) {
        currentRange = currentRange.parent;
        const parentText = getRangeText(text, currentRange.range);
        console.log(`\nChecking parent range: "${parentText}"`);
        if (parentText.includes('service UserService')) {
            hasBlockRange = true;
            console.log('✓ Found service block range!');
            break;
        }
    }
    
    if (!hasBlockRange) {
        console.log('✗ Missing service block range');
        console.log('Expected range to include: "service UserService"');
        
        // Let's check what ranges we actually have
        currentRange = firstRange;
        level = 0;
        console.log('\nActual hierarchy:');
        while (currentRange) {
            const rangeText = getRangeText(text, currentRange.range);
            console.log(`Level ${level}: "${rangeText}"`);
            currentRange = currentRange.parent;
            level++;
        }
    }
}

debugBlockSelection().catch(console.error);