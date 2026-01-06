const { ThriftFormatter } = require('../../../out/formatter/index.js');

function testStructFormatting() {
    console.log('Testing struct formatting behavior...\n');
    
    const formatter = new ThriftFormatter();
    
    // Test 1: Single-line struct (current failing case)
    console.log('Test 1: Single-line struct');
    const singleLine = 'struct User{1:i32 id;2:string name;}';
    console.log('Input:', JSON.stringify(singleLine));
    
    const result1 = formatter.format(singleLine, {
        alignTypes: true,
        alignFieldNames: true,
        indentSize: 4,
        insertSpaces: true,
        tabSize: 4
    });
    
    console.log('Output:', JSON.stringify(result1));
    console.log('Expected: Multi-line formatted struct');
    console.log('Status:', result1 === singleLine ? 'FAILED - No formatting applied' : 'PASSED');
    console.log('');
    
    // Test 2: Multi-line struct (should work)
    console.log('Test 2: Multi-line struct');
    const multiLine = `struct User {
    1: i32 id,
    2: string name
}`;
    console.log('Input:', JSON.stringify(multiLine));
    
    const result2 = formatter.format(multiLine, {
        alignTypes: true,
        alignFieldNames: true,
        indentSize: 4,
        insertSpaces: true,
        tabSize: 4
    });
    
    console.log('Output:', JSON.stringify(result2));
    console.log('Status:', 'Should format properly');
    console.log('');
    
    // Test 3: Single-line struct with proper spacing
    console.log('Test 3: Single-line struct with spaces');
    const spacedLine = 'struct User { 1: i32 id; 2: string name; }';
    console.log('Input:', JSON.stringify(spacedLine));
    
    const result3 = formatter.format(spacedLine, {
        alignTypes: true,
        alignFieldNames: true,
        indentSize: 4,
        insertSpaces: true,
        tabSize: 4
    });
    
    console.log('Output:', JSON.stringify(result3));
    console.log('Status:', 'Testing with spaces');
}

testStructFormatting();