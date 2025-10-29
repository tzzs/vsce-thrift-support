const assert = require('assert');
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

// Import the provider from built output
const { ThriftFormattingProvider } = require('../out/formattingProvider.js');

// Main test function
function runTests() {
    console.log('=== Testing Thrift Multi-line Default Values Formatting ===');
    
    const provider = new ThriftFormattingProvider();
    const options = {
        tabSize: 4,
        insertSpaces: true,
        alignTypes: true,
        alignFieldNames: true,
        alignComments: true,
        alignAnnotations: true,
        alignStructDefaults: true,
        trailingComma: 'preserve',
        maxLineLength: 100
    };
    
    let testPassed = 0;
    let testFailed = 0;
    
    // Test 1: Multi-line list default value
    try {
        console.log('\nTest 1: Multi-line list default value');
        const source = `
28: required list<string> stringList = [
    "item1",
    "item2",
    "item3"
], // comment for stringList
`;
        
        const parsed = provider.parseStructField(source.trim());
        console.log('  Parsed type:', parsed.type);
        console.log('  Parsed name:', parsed.name);
        console.log('  Parsed suffix preview:', parsed.suffix.substring(0, 50) + '...');
        
        assert.strictEqual(parsed.type, 'list<string>');
        assert.strictEqual(parsed.name, 'stringList');
        assert.ok(parsed.suffix.includes('['));
        assert.ok(parsed.suffix.includes(']'));
        assert.ok(parsed.suffix.includes('item1'));
        
        const formatted = provider.formatMultiLineStructField(
            parsed,
            options,
            1,
            2,  // maxFieldIdWidth
            12, // maxTypeWidth
            10, // maxNameWidth
            40, // targetAnnoStart
            50, // maxContentWidth
            1   // commentCount
        );
        
        console.log('  Formatted preview:', formatted.split('\n')[0]);
        assert.ok(formatted.includes('list<string>'));
        assert.ok(formatted.includes('stringList ='));
        assert.ok(formatted.includes('['));
        assert.ok(formatted.includes(']'));
        
        console.log('  ✓ Test passed');
        testPassed++;
    } catch (error) {
        console.error('  ✗ Test failed:', error.message);
        testFailed++;
    }
    
    // Test 2: Multi-line map default value
    try {
        console.log('\nTest 2: Multi-line map default value');
        const source = `
32: required map<string, i32> intMap = {
    "key1": 1,
    "key2": 2,
    "key3": 3
}, // comment for intMap
`;
        
        const parsed = provider.parseStructField(source.trim());
        console.log('  Parsed type:', parsed.type);
        console.log('  Parsed name:', parsed.name);
        
        assert.strictEqual(parsed.type, 'map<string,i32>');
        assert.strictEqual(parsed.name, 'intMap');
        assert.ok(parsed.suffix.includes('{'));
        assert.ok(parsed.suffix.includes('}'));
        assert.ok(parsed.suffix.includes('key1'));
        
        console.log('  ✓ Test passed');
        testPassed++;
    } catch (error) {
        console.error('  ✗ Test failed:', error.message);
        testFailed++;
    }
    
    // Test 3: Multi-line string default value
    try {
        console.log('\nTest 3: Multi-line string default value');
        const source = `
40: required string multiLineString = "This is a very long string that spans multiple lines"
"and continues here with more content", // comment for string
`;
        
        const parsed = provider.parseStructField(source.trim());
        console.log('  Parsed type:', parsed.type);
        console.log('  Parsed name:', parsed.name);
        
        assert.strictEqual(parsed.type, 'string');
        assert.strictEqual(parsed.name, 'multiLineString');
        assert.ok(parsed.suffix.includes('"This'));
        assert.ok(parsed.suffix.includes('content"'));
        
        console.log('  ✓ Test passed');
        testPassed++;
    } catch (error) {
        console.error('  ✗ Test failed:', error.message);
        testFailed++;
    }
    
    // Test 4: Complex nested multi-line default values
    try {
        console.log('\nTest 4: Complex nested multi-line default values');
        const source = `
42: required list<map<string, string>> complexList = [
    {
        "name": "item1",
        "value": "value1"
    },
    {
        "name": "item2",
        "value": "value2"
    }
], // complex nested structure
`;
        
        const parsed = provider.parseStructField(source.trim());
        console.log('  Parsed type:', parsed.type);
        console.log('  Parsed name:', parsed.name);
        
        assert.strictEqual(parsed.type, 'list<map<string,string>>');
        assert.strictEqual(parsed.name, 'complexList');
        assert.ok(parsed.suffix.includes('['));
        assert.ok(parsed.suffix.includes(']'));
        assert.ok(parsed.suffix.includes('{'));
        assert.ok(parsed.suffix.includes('}'));
        
        console.log('  ✓ Test passed');
        testPassed++;
    } catch (error) {
        console.error('  ✗ Test failed:', error.message);
        testFailed++;
    }
    
    // Summary
    console.log('\n=== Test Summary ===');
    console.log(`Passed: ${testPassed}`);
    console.log(`Failed: ${testFailed}`);
    
    if (testFailed === 0) {
        console.log('🎉 All tests passed!');
        process.exit(0);
    } else {
        console.log('❌ Some tests failed.');
        process.exit(1);
    }
}

// Run the tests
runTests();