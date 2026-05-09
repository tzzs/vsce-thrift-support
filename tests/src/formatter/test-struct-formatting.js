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

    it('no-trailing-comma field with comment gets 1 space before comment when it is the widest field', () => {
        const assert = require('assert');
        const formatter = new ThriftFormatter();
        const input = [
            'exception UserNotFoundException {',
            '    1: required string message,',
            '    2: optional i32    errorCode = 404  // error code',
            '}'
        ].join('\n');
        const result = formatter.format(input, {
            alignTypes: true,
            alignFieldNames: true,
            alignComments: true,
            trailingComma: 'preserve',
            indentSize: 4,
            insertSpaces: true,
            tabSize: 4
        });
        const lines = result.split('\n');
        assert.ok(lines[2].includes('errorCode = 404 //'), `expected 1 space before comment, got: ${lines[2]}`);
        assert.ok(!lines[2].includes('errorCode = 404  //'), `should NOT have 2 spaces before comment, got: ${lines[2]}`);
    });
});