// Mock VS Code module
const vscode = {
    Range: class {
        constructor(start, end) {
            this.start = start;
            this.end = end;
        }
    },
    Position: class {
        constructor(line, character) {
            this.line = line;
            this.character = character;
        }
    },
    TextEdit: class {
        constructor(range, newText) {
            this.range = range;
            this.newText = newText;
        }
        static replace(range, newText) {
            return new vscode.TextEdit(range, newText);
        }
    }
};

// Mock the vscode module
const Module = require('module');
const originalRequire = Module.prototype.require;
Module.prototype.require = function(id) {
    if (id === 'vscode') {
        return vscode;
    }
    return originalRequire.apply(this, arguments);
};

const formatterModule = require('./out/formatter');
const ThriftFormattingProvider = formatterModule.ThriftFormattingProvider;

// Test the specific case from scenario 5
const testInput = `const map<string, string> SIMPLE_MAP = {"key1": "value1", "key2": "value2"}`;

console.log('Input:');
console.log(testInput);
console.log();

const formatter = new ThriftFormattingProvider();
const options = { insertSpaces: true, tabSize: 4 };

// Test the formatting
const result = formatter.formatThriftCode(testInput, options);

console.log('Formatted result:');
console.log(JSON.stringify(result));
console.log();
console.log('Actual output:');
console.log(result);
console.log();

// Check indentation of each line
const lines = result.split('\n');
lines.forEach((line, index) => {
    const leadingSpaces = line.match(/^( *)/)[1].length;
    console.log(`Line ${index + 1}: "${line}" -> ${leadingSpaces} spaces`);
});

// Test with indentLevel = 1 to simulate nested context
console.log('\n=== Testing with indentLevel = 1 ===');
const testInput2 = `    const map<string, string> SIMPLE_MAP = {"key1": "value1", "key2": "value2"}`;
console.log('Input with 1 level indent:');
console.log(testInput2);

const result2 = formatter.formatThriftCode(testInput2, options);
console.log('\nFormatted result:');
console.log(result2);

const lines2 = result2.split('\n');
lines2.forEach((line, index) => {
    const leadingSpaces = line.match(/^( *)/)[1].length;
    console.log(`Line ${index + 1}: "${line}" -> ${leadingSpaces} spaces`);
});