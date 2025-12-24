const Module = require('module');
const originalRequire = Module.prototype.require;

// Mock VS Code module
Module.prototype.require = function(id) {
    if (id === 'vscode') {
        return {
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
            }
        };
    }
    return originalRequire.apply(this, arguments);
};

const fs = require('fs');
const path = require('path');

// Load the compiled provider
const { ThriftSelectionRangeProvider } = require('./out/src/selectionRangeProvider');

function createMockDocument(text) {
    return {
        getText: () => text,
        lineAt: (line) => ({
            text: text.split('\n')[line] || ''
        }),
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
    return {
        isCancellationRequested: false
    };
}

function getRangeText(text, range) {
    const lines = text.split('\n');
    const startLine = lines[range.start.line];
    return startLine.substring(range.start.character, range.end.character);
}

async function testMethodSignatureSelection() {
    console.log('=== Testing Method Signature Selection with Debug ===');

    const provider = new ThriftSelectionRangeProvider();
    const text = `service UserService {
  User getUser(1: i32 userId, 2: string name),
  void createUser(1: User user)
}`;
    const document = createMockDocument(text);
    const position = createMockPosition(1, 6); // On whitespace between "User" and "getUser"

    console.log('Text:', JSON.stringify(text));
    console.log('Position:', position);
    console.log('Line 1:', JSON.stringify(text.split('\n')[1]));
    console.log('Character at position 6:', JSON.stringify(text.split('\n')[1][6]));

    // Call the internal method directly to see the debug output
    const ranges = provider.getSelectionRangesForPosition(document, position);
    
    console.log('\nNumber of ranges found:', ranges.length);
    ranges.forEach((range, index) => {
        const start = range.range.start;
        const end = range.range.end;
        const selectedText = getRangeText(text, range.range);
        console.log(`Range ${index}: (${start.line}, ${start.character}) to (${end.line}, ${end.character}) - "${selectedText}"`);
        if (range.parent) {
            const parentStart = range.parent.range.start;
            const parentEnd = range.parent.range.end;
            const parentText = getRangeText(text, range.parent.range);
            console.log(`  Parent: (${parentStart.line}, ${parentStart.character}) to (${parentEnd.line}, ${parentEnd.character}) - "${parentText}"`);
        }
    });

    // Test the expected result
    if (ranges.length > 0) {
        const firstRange = ranges[0];
        const selectedText = getRangeText(text, firstRange.range);
        
        console.log('\nExpected: "getUser"');
        console.log('Actual:', JSON.stringify(selectedText));
        
        if (selectedText === 'getUser') {
            console.log('✅ Test PASSED: Method name selected correctly');
        } else {
            console.log('❌ Test FAILED: Expected "getUser", got', JSON.stringify(selectedText));
        }
    } else {
        console.log('❌ Test FAILED: No ranges found');
    }
}

testMethodSignatureSelection().catch(console.error);