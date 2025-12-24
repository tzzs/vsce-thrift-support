// Mock VS Code module before requiring the provider
const Module = require('module');
const originalRequire = Module.prototype.require;

Module.prototype.require = function(id) {
    if (id === 'vscode') {
        return {
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
    }
    return originalRequire.apply(this, arguments);
};

const { ThriftSelectionRangeProvider } = require('./out/src/selectionRangeProvider');

// Mock document
const text = `service UserService {
  User getUser(1: i32 userId, 2: string name),
  void createUser(1: User user)
}`;

const document = {
    getText: () => text,
    getWordRangeAtPosition: (position) => {
        const line = text.split('\n')[position.line];
        const wordRegex = /[A-Za-z_][A-Za-z0-9_]*/g;
        let match;
        while ((match = wordRegex.exec(line)) !== null) {
            if (match.index <= position.character && match.index + match[0].length > position.character) {
                const vscode = {
                    Range: class {
                        constructor(startLine, startChar, endLine, endChar) {
                            this.start = { line: startLine, character: startChar };
                            this.end = { line: endLine, character: endChar };
                        }
                    }
                };
                return new vscode.Range(position.line, match.index, position.line, match.index + match[0].length);
            }
        }
        return null;
    }
};

// Mock position
const position = { line: 1, character: 6 }; // On "getUser"

// Create provider instance
const provider = new ThriftSelectionRangeProvider();

// Test the provider
console.log('Testing position (1, 6) on line:', text.split('\n')[1]);
console.log('Character at position (1, 6):', JSON.stringify(text.split('\n')[1][6]));
console.log('Full line:', JSON.stringify(text.split('\n')[1]));

const ranges = provider.getSelectionRangesForPosition(document, position);

console.log('\nNumber of ranges found:', ranges.length);
ranges.forEach((range, index) => {
    const start = range.range.start;
    const end = range.range.end;
    const selectedText = text.split('\n')[start.line].substring(start.character, end.character);
    console.log(`Range ${index}: (${start.line}, ${start.character}) to (${end.line}, ${end.character}) - "${selectedText}"`);
    if (range.parent) {
        const parentStart = range.parent.range.start;
        const parentEnd = range.parent.range.end;
        const parentText = text.split('\n')[parentStart.line].substring(parentStart.character, parentEnd.character);
        console.log(`  Parent: (${parentStart.line}, ${parentStart.character}) to (${parentEnd.line}, ${parentEnd.character}) - "${parentText}"`);
    }
});

// Check what the regex matches
const currentLine = text.split('\n')[1];
const methodMatch = currentLine.match(/^(\s*)(oneway\s+)?([A-Za-z_][A-Za-z0-9_]*(?:\s*<[^>]+>\s*)?)\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/);
console.log('\nMethod regex match:', methodMatch);
if (methodMatch) {
    console.log('Return type:', methodMatch[3]);
    console.log('Method name:', methodMatch[4]);
    console.log('Match index:', methodMatch.index);
    
    const returnType = methodMatch[3];
    const methodName = methodMatch[4];
    const returnTypeStart = currentLine.indexOf(returnType, methodMatch.index + methodMatch[1].length + (methodMatch[2] ? methodMatch[2].length : 0));
    const methodNameStart = currentLine.indexOf(methodName, returnTypeStart + returnType.length);
    
    console.log('Return type start:', returnTypeStart);
    console.log('Method name start:', methodNameStart);
    console.log('Position character:', position.character);
    console.log('Is on whitespace?', position.character >= returnTypeStart + returnType.length && position.character < methodNameStart);
}