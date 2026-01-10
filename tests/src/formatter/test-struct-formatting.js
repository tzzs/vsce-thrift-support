const {ThriftFormatter} = require('../../../out/formatter/index.js');

function testStructFormatting() {

    const formatter = new ThriftFormatter();

    // Test 1: Single-line struct (current failing case)
    const singleLine = 'struct User{1:i32 id;2:string name;}';

    const result1 = formatter.format(singleLine, {
        alignTypes: true,
        alignFieldNames: true,
        indentSize: 4,
        insertSpaces: true,
        tabSize: 4
    });


    // Test 2: Multi-line struct (should work)
    const multiLine = `struct User {
    1: i32 id,
    2: string name
}`;

    const result2 = formatter.format(multiLine, {
        alignTypes: true,
        alignFieldNames: true,
        indentSize: 4,
        insertSpaces: true,
        tabSize: 4
    });


    // Test 3: Single-line struct with proper spacing
    const spacedLine = 'struct User { 1: i32 id; 2: string name; }';

    const result3 = formatter.format(spacedLine, {
        alignTypes: true,
        alignFieldNames: true,
        indentSize: 4,
        insertSpaces: true,
        tabSize: 4
    });

}

describe('struct-formatting', () => {
    it('should pass all test assertions', () => {
        testStructFormatting();
    });
});