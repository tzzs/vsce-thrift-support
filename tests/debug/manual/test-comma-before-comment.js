// Mock vscode module
const vscode = {
    workspace: {
        getConfiguration: (section) => {
            const config = {
                'thrift-support.formatting.trailingComma': global.testTrailingComma || 'preserve',
                'thrift-support.formatting.alignTypes': false,
                'thrift-support.formatting.alignFieldNames': false,
                'thrift-support.formatting.alignComments': false, // Disable comment alignment for cleaner tests
                'thrift-support.formatting.alignEnumNames': false,
                'thrift-support.formatting.alignEnumEquals': false,
                'thrift-support.formatting.alignEnumValues': false,
                'thrift-support.formatting.indentSize': 4
            };
            
            return {
                get: (key) => {
                    const fullKey = section ? `${section}.${key}` : key;
                    return config[fullKey] !== undefined ? config[fullKey] : null;
                }
            };
        }
    },
    TextEdit: {
        replace: (range, newText) => {
            return { range, newText };
        }
    }
};

// Set up module mock before requiring formatter
const Module = require('module');
const originalRequire = Module.prototype.require;

Module.prototype.require = function(id) {
    if (id === 'vscode') {
        return vscode;
    }
    return originalRequire.apply(this, arguments);
};

// Import the formatter
const { ThriftFormattingProvider } = require('../out/formattingProvider.js');

// Restore original require
Module.prototype.require = originalRequire;

function testCommaBeforeComment() {
    console.log('Testing comma position relative to comments...');
    
    const formatter = new ThriftFormattingProvider();
    
    const testCases = [
        {
            name: 'Comma before comment - preserve mode',
            trailingComma: 'preserve',
            input: `struct User {
    1: string name, // User's name
    2: i32 age // User's age
}`,
            expectedCheck: (output) => {
                const lines = output.split('\n');
                const line1 = lines[1] || '';
                const line2 = lines[2] || '';
                const commaBeforeComment1 = /name,\s*\/\//.test(line1);
                const noCommaBeforeComment2 = /age\s*\/\//.test(line2) && !/age,\s*\/\//.test(line2);
                console.log(`  Line 1: "${line1}"`);
                console.log(`  Line 2: "${line2}"`);
                return commaBeforeComment1 && noCommaBeforeComment2;
            },
            description: 'Comma should stay before comment, not move after'
        },
        {
            name: 'Comma before comment - add mode',
            trailingComma: 'add',
            input: `struct User {
    1: string name // User's name
    2: i32 age // User's age
}`,
            expectedCheck: (output) => {
                const lines = output.split('\n');
                const line1 = lines[1] || '';
                const line2 = lines[2] || '';
                const commaBeforeComment1 = /name,\s*\/\//.test(line1);
                const commaBeforeComment2 = /age,\s*\/\//.test(line2);
                console.log(`  Line 1: "${line1}"`);
                console.log(`  Line 2: "${line2}"`);
                return commaBeforeComment1 && commaBeforeComment2;
            },
            description: 'Added comma should appear before comment'
        },
        {
            name: 'Comma before comment - remove mode',
            trailingComma: 'remove',
            input: `struct User {
    1: string name, // User's name
    2: i32 age, // User's age
}`,
            expectedCheck: (output) => {
                const lines = output.split('\n');
                const line1 = lines[1] || '';
                const line2 = lines[2] || '';
                const noCommaBeforeComment1 = /name\s*\/\//.test(line1) && !/name,\s*\/\//.test(line1);
                const noCommaBeforeComment2 = /age\s*\/\//.test(line2) && !/age,\s*\/\//.test(line2);
                console.log(`  Line 1: "${line1}"`);
                console.log(`  Line 2: "${line2}"`);
                return noCommaBeforeComment1 && noCommaBeforeComment2;
            },
            description: 'Commas should be removed, comments stay in place'
        },
        {
            name: 'Enum with comments - preserve mode',
            trailingComma: 'preserve',
            input: `enum Status {
    ACTIVE = 1, // Active status
    INACTIVE = 2 // Inactive status
}`,
            expectedCheck: (output) => {
                const lines = output.split('\n');
                const line1 = lines[1] || '';
                const line2 = lines[2] || '';
                const commaBeforeComment1 = /1,\s*\/\//.test(line1);
                const noCommaBeforeComment2 = /2\s*\/\//.test(line2) && !/2,\s*\/\//.test(line2);
                console.log(`  Line 1: "${line1}"`);
                console.log(`  Line 2: "${line2}"`);
                return commaBeforeComment1 && noCommaBeforeComment2;
            },
            description: 'Enum commas should stay before comments'
        },
        {
            name: 'Comma between annotation and comment',
            trailingComma: 'preserve',
            input: `struct User {
    1: string name (go.tag="json:\"name\""), // User's name
    2: i32 age (go.tag="json:\"age\"") // User's age
}`,
            expectedCheck: (output) => {
                const lines = output.split('\n');
                const line1 = lines[1] || '';
                const line2 = lines[2] || '';
                const commaBeforeComment1 = /"\),\s*\/\//.test(line1);
                console.log(`  Line 1: "${line1}"`);
                console.log(`  Line 2: "${line2}"`);
                return commaBeforeComment1;
            },
            description: 'Comma should be between annotation and comment'
        }
    ];
    
    let allPassed = true;
    
    testCases.forEach(testCase => {
        console.log(`\n--- ${testCase.name} ---`);
        
        // Set global test configuration
        global.testTrailingComma = testCase.trailingComma;
        
        // Mock document and range
        const mockDocument = {
            getText: () => testCase.input
        };
        const mockRange = { start: { line: 0, character: 0 }, end: { line: 10, character: 100 } };
        const mockOptions = { insertSpaces: true, tabSize: 4 };
        
        try {
            const result = formatter.provideDocumentRangeFormattingEdits(
                mockDocument,
                mockRange,
                mockOptions
            );
            
            const passes = testCase.expectedCheck(result[0].newText);
            console.log(`\nResult: ${passes ? 'PASS' : 'FAIL'}`);
            console.log(`Description: ${testCase.description}`);
            
            if (!passes) {
                allPassed = false;
            }
            
        } catch (error) {
            console.log('Error:', error.message);
            allPassed = false;
        }
    });
    
    // Clean up
    delete global.testTrailingComma;
    
    console.log(`\n=== Summary: ${allPassed ? 'All tests passed!' : 'Some tests failed!'} ===`);
}

testCommaBeforeComment();
