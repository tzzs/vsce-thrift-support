const Module = require('module');

// Mock VSCode API
const vscode = {
    workspace: {
        getConfiguration: () => ({
            get: (key, defaultValue) => {
                const configs = {
                    'trailingComma': 'preserve',
                    'alignTypes': true,
                    'alignFieldNames': false,
                    'alignComments': true,
                    'indentSize': 4,
                    'maxLineLength': 100
                };
                return configs[key] !== undefined ? configs[key] : defaultValue;
            }
        })
    }
};

// Mock require for vscode module
const originalRequire = Module.prototype.require;
Module.prototype.require = function(id) {
    if (id === 'vscode') {
        return vscode;
    }
    return originalRequire.apply(this, arguments);
};

// Test parsing directly
function debugParsing() {
    console.log('Debug parsing...');
    
    try {
        const { ThriftFormattingProvider } = require('../out/formattingProvider.js');
        const formatter = new ThriftFormattingProvider();
        
        const testLines = [
            '    1: required list < string > names,',
            '    2: optional map< string , i32 > values  ,',
            '    3: i32 count'
        ];
        
        testLines.forEach((line, index) => {
            console.log(`\nTesting line ${index + 1}: "${line}"`);
            
            // Test isStructField
            const isField = formatter.isStructField(line);
            console.log(`  isStructField: ${isField}`);
            
            if (isField) {
                // Test parseStructField
                const parsed = formatter.parseStructField(line);
                if (parsed) {
                    console.log(`  Parsed type: "${parsed.type}"`);
                    console.log(`  Parsed name: "${parsed.name}"`);
                } else {
                    console.log(`  Failed to parse`);
                }
            }
        });
    } catch (error) {
        console.log('Debug failed:', error.message);
        console.log(error.stack);
    }
}

debugParsing();
