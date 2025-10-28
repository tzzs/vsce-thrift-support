const fs = require('fs');
const path = require('path');

// Mock vscode module to avoid dependency issues
const mockVscode = {
    Range: class Range {
        constructor(start, end) {
            this.start = start;
            this.end = end;
        }
    },
    Position: class Position {
        constructor(line, character) {
            this.line = line;
            this.character = character;
        }
    }
};

// Mock the vscode module
require.cache[require.resolve('vscode')] = {
    exports: mockVscode
};

// Now import the formatting provider
const { ThriftFormattingProvider } = require('../out/formattingProvider');

function testFormatting() {
    const provider = new ThriftFormattingProvider();
    const content = fs.readFileSync('test-files/annotation-edge-cases.thrift', 'utf8');
    
    console.log('=== ORIGINAL CONTENT ===');
    console.log(content);
    console.log('\n=== FORMATTED CONTENT ===');
    
    const options = {
        alignAnnotations: true,
        alignComments: true,
        collectionStyle: 'multiline',
        indentSize: 4,
        insertSpaces: true,
        trailingComma: 'preserve'
    };
    
    try {
        const result = provider.format(content, options);
        console.log(result);
        
        // Write the formatted result to a file for inspection
        fs.writeFileSync('test-files/annotation-edge-cases-formatted.thrift', result);
        console.log('\nFormatted output written to test-files/annotation-edge-cases-formatted.thrift');
        
    } catch (error) {
        console.error('Formatting error:', error);
        console.error('Stack:', error.stack);
    }
}

testFormatting();