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

// Load the compiled provider and add debug logging
const providerCode = fs.readFileSync('./out/src/selectionRangeProvider.js', 'utf8');

// Add debug logging to the method signature matching section
const debugCode = `
    // Method definitions
    const methodMatch = currentLine.match(/^(\\s*)(oneway\\s+)?([A-Za-z_][A-Za-z0-9_]*(?:\\s*<[^>]+>\\s*)?)\\s+([A-Za-z_][A-Za-z0-9_]*)\\s*\\(/);
    if (methodMatch && methodMatch.index !== undefined) {
        const returnType = methodMatch[3];
        const methodName = methodMatch[4];
        
        const returnTypeStart = methodMatch.index + methodMatch[1].length + (methodMatch[2] ? methodMatch[2].length : 0);
        const methodNameStart = currentLine.indexOf(methodName, returnTypeStart + returnType.length);
        
        console.log('DEBUG: Method match found:');
        console.log('  Return type:', JSON.stringify(returnType), 'at position', returnTypeStart);
        console.log('  Method name:', JSON.stringify(methodName), 'at position', methodNameStart);
        console.log('  Current position:', position.character);
        console.log('  Return type end:', returnTypeStart + returnType.length);
        
        // Check if position is on whitespace between return type and method name
        const isOnWhitespace = position.character >= returnTypeStart + returnType.length && position.character < methodNameStart;
        console.log('  isOnWhitespace:', isOnWhitespace);
        console.log('  Condition check:', position.character, '>=', returnTypeStart + returnType.length, '&&', position.character, '<', methodNameStart);
`;

// Find the method signature section and add debug logging
const modifiedCode = providerCode.replace(
    /(\s+\/\/ Method definitions\s+const methodMatch = currentLine\.match\([^;]+\);\s+if \(methodMatch && methodMatch\.index !== undefined\) \{\s+const returnType = methodMatch\[3\];\s+const methodName = methodMatch\[4\];\s+\s+const returnTypeStart = methodMatch\.index \+ methodMatch\[1\]\.length \+ \(methodMatch\[2\] \? methodMatch\[2\]\.length : 0\);\s+const methodNameStart = currentLine\.indexOf\(methodName, returnTypeStart \+ returnType\.length\);)/,
    debugCode
);

// Write the modified code to a temporary file
fs.writeFileSync('./out/src/selectionRangeProvider-debug.js', modifiedCode);

// Now load and test
const { ThriftSelectionRangeProvider } = require('./out/src/selectionRangeProvider-debug.js');

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

function getRangeText(text, range) {
    const lines = text.split('\n');
    const startLine = lines[range.start.line];
    return startLine.substring(range.start.character, range.end.character);
}

async function testWithDebug() {
    console.log('=== Testing with Debug Logging ===');

    const provider = new ThriftSelectionRangeProvider();
    const text = `service UserService {
  User getUser(1: i32 userId, 2: string name),
  void createUser(1: User user)
}`;
    const document = createMockDocument(text);
    const position = createMockPosition(1, 6); // On whitespace between "User" and "getUser"

    console.log('Testing position (1, 6) on line:', text.split('\n')[1]);
    console.log('Character at position (1, 6):', JSON.stringify(text.split('\n')[1][6]));

    const ranges = provider.getSelectionRangesForPosition(document, position);
    
    console.log('\nFinal ranges found:', ranges.length);
    ranges.forEach((range, index) => {
        const start = range.range.start;
        const end = range.range.end;
        const selectedText = getRangeText(text, range.range);
        console.log(`Range ${index}: (${start.line}, ${start.character}) to (${end.line}, ${end.character}) - "${selectedText}"`);
    });
}

testWithDebug().catch(console.error);