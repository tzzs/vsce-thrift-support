// Mock vscode module
const vscode = {
    workspace: {
        getConfiguration: (section) => {
            const config = {
                'thrift-support.formatting.trailingComma': 'preserve',
                'thrift-support.formatting.alignTypes': true,
                'thrift-support.formatting.alignFieldNames': true,
                'thrift-support.formatting.alignComments': true,
                'thrift-support.formatting.alignEnumNames': true,
                'thrift-support.formatting.alignEnumEquals': true,
                'thrift-support.formatting.alignEnumValues': true,
                'thrift-support.formatting.indentSize': global.testIndentSize || 4
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
    },
    Range: function(startLine, startChar, endLine, endChar) {
        return { start: { line: startLine, character: startChar }, end: { line: endLine, character: endChar } };
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
const { ThriftFormattingProvider } = require('../out/formatter');

// Restore original require
Module.prototype.require = originalRequire;

function testIndentWidth() {
    console.log('Testing indent width functionality...');
    
    const formatter = new ThriftFormattingProvider();
    
    const testCases = [
        {
            name: 'Default indent width (4 spaces)',
            indentSize: 4,
            input: `struct User {
1: string name,
2: i32 age
}`,
            expectedPattern: /^    1: string name/m // Should start with 4 spaces
        },
        {
            name: 'Custom indent width (2 spaces)',
            indentSize: 2,
            input: `struct User {
1: string name,
2: i32 age
}`,
            expectedPattern: /^  1: string name/m // Should start with 2 spaces
        },
        {
            name: 'Custom indent width (8 spaces)',
            indentSize: 8,
            input: `struct User {
1: string name,
2: i32 age
}`,
            expectedPattern: /^        1: string name/m // Should start with 8 spaces
        }
    ];
    
    testCases.forEach(testCase => {
        console.log(`\n--- ${testCase.name} ---`);
        
        // Set global test configuration
        global.testIndentSize = testCase.indentSize;
        
        // Mock document and range
        const mockDocument = {
            getText: () => testCase.input
        };
        const mockRange = { start: { line: 0, character: 0 }, end: { line: 4, character: 1 } };
        const mockOptions = { insertSpaces: true, tabSize: testCase.indentSize };
        
        try {
            const result = formatter.provideDocumentRangeFormattingEdits(
                mockDocument,
                mockRange,
                mockOptions
            );
            
            console.log('Input:');
            console.log(testCase.input);
            console.log('\nOutput:');
            console.log(result[0].newText);
            
            // Check if the output matches expected pattern
            const matches = testCase.expectedPattern.test(result[0].newText);
            console.log(`\nIndent check: ${matches ? 'PASS' : 'FAIL'}`);
            
            if (!matches) {
                console.log(`Expected pattern: ${testCase.expectedPattern}`);
                console.log('Actual first line with field:', result[0].newText.split('\n').find(line => line.includes(': string')));
            }
            
        } catch (error) {
            console.log('Error:', error.message);
        }
    });
    
    // Clean up
    delete global.testIndentSize;
    
    console.log('\nIndent width tests completed!');
}

testIndentWidth();