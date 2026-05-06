const assert = require('assert');

const {ThriftFormattingProvider} = require('../../../out/formatting-bridge/index.js');

describe('trailing-comma', () => {
    let vscode;
    let formatter;
    let originalGetConfiguration;

    before(() => {
        vscode = require('vscode');
        formatter = new ThriftFormattingProvider();
        originalGetConfiguration = vscode.workspace.getConfiguration;
    });

    afterEach(() => {
        vscode.workspace.getConfiguration = originalGetConfiguration;
    });

    function formatWithTrailingComma(input, trailingCommaMode) {
        vscode.workspace.getConfiguration = (section) => {
            const config = {
                'thrift-support.formatting.trailingComma': trailingCommaMode,
                'thrift-support.formatting.alignTypes': false,
                'thrift-support.formatting.alignFieldNames': false,
                'thrift-support.formatting.alignComments': false,
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
        };

        const mockDocument = {
            getText: () => input
        };
        const mockRange = {start: {line: 0, character: 0}, end: {line: 4, character: 1}};
        const mockOptions = {insertSpaces: true, tabSize: 4};

        const result = formatter.provideDocumentRangeFormattingEdits(mockDocument, mockRange, mockOptions);
        return result[0].newText;
    }

    it('should preserve existing commas in preserve mode', () => {
        const input = `struct User {
    1: string name,
    2: i32 age
}`;
        const output = formatWithTrailingComma(input, 'preserve');

        assert.ok(output.includes('name,'), 'Should keep comma after name');
        assert.ok(!output.includes('age,'), 'Should not add comma after age');
    });

    it('should preserve no commas in preserve mode', () => {
        const input = `struct User {
    1: string name
    2: i32 age
}`;
        const output = formatWithTrailingComma(input, 'preserve');

        assert.ok(!output.includes('name,'), 'Should keep no comma after name');
        assert.ok(!output.includes('age,'), 'Should keep no comma after age');
    });

    it('should add missing commas in add mode', () => {
        const input = `struct User {
    1: string name
    2: i32 age
}`;
        const output = formatWithTrailingComma(input, 'add');

        assert.ok(output.includes('name,'), 'Should add comma after name');
        assert.ok(output.includes('age,'), 'Should add comma after age');
    });

    it('should remove existing commas in remove mode', () => {
        const input = `struct User {
    1: string name,
    2: i32 age,
}`;
        const output = formatWithTrailingComma(input, 'remove');

        assert.ok(!output.includes('name,'), 'Should remove comma after name');
        assert.ok(!output.includes('age,'), 'Should remove comma after age');
    });

    it('should handle enum preserve mode', () => {
        const input = `enum Status {
    ACTIVE = 1,
    INACTIVE = 2
}`;
        const output = formatWithTrailingComma(input, 'preserve');

        assert.ok(output.includes('ACTIVE = 1,'), 'Should keep comma after ACTIVE');
        assert.ok(!output.includes('INACTIVE = 2,'), 'Should not add comma after INACTIVE');
    });

    it('should handle enum add mode', () => {
        const input = `enum Status {
    ACTIVE = 1
    INACTIVE = 2
}`;
        const output = formatWithTrailingComma(input, 'add');

        assert.ok(output.includes('ACTIVE = 1,'), 'Should add comma after ACTIVE');
        assert.ok(output.includes('INACTIVE = 2,'), 'Should add comma after INACTIVE');
    });

    it('should handle enum remove mode', () => {
        const input = `enum Status {
    ACTIVE = 1,
    INACTIVE = 2,
}`;
        const output = formatWithTrailingComma(input, 'remove');

        assert.ok(output.includes('ACTIVE = 1') && !output.includes('ACTIVE = 1,'), 'Should remove comma after ACTIVE');
        assert.ok(output.includes('INACTIVE = 2') && !output.includes('INACTIVE = 2,'), 'Should remove comma after INACTIVE');
    });

    it('should append comma without preceding spaces when annotations add padding', () => {
        const input = `struct S {
    1: string a (anno='x')
    2: i32    b (anno='y')    
}`;
        const output = formatWithTrailingComma(input, 'add');
        const lines = output.split('\n').filter(l => l.trim().length > 0);
        const l1 = lines[1] || '';
        const l2 = lines[2] || '';

        const noSpaceBeforeComma1 = !/\)\s+,\s*$/.test(l1) && /\),\s*$/.test(l1);
        const noSpaceBeforeComma2 = !/\)\s+,\s*$/.test(l2) && /\),\s*$/.test(l2);

        assert.ok(noSpaceBeforeComma1 && noSpaceBeforeComma2, 'Comma should be tight to closing paren');
    });

    it('should place trailing comma after line comments in struct add mode', () => {
        const input = `struct S {
    1: string a (anno='x') // c1
    2: i32 b // c2
}`;
        const output = formatWithTrailingComma(input, 'add');
        const lines = output.split('\n');
        const l1 = lines[1] || '';
        const l2 = lines[2] || '';

        assert.ok(/\/\/.*,\s*$/.test(l1), 'Comma should be at end after comment');
        assert.ok(/\/\/.*,\s*$/.test(l2), 'Comma should be at end after comment');
        assert.ok(!/,\s*\/\//.test(l1), 'Comma should not be before comment');
        assert.ok(!/,\s*\/\//.test(l2), 'Comma should not be before comment');
    });

    it('should place semicolon after line comments in enum add mode', () => {
        const input = `enum E {
    A = 1; // a
    B = 2 // b
}`;
        const output = formatWithTrailingComma(input, 'add');
        const lines = output.split('\n');
        const l1 = lines[1] || '';
        const l2 = lines[2] || '';

        assert.ok(/\/\/.*;\s*$/.test(l1), 'Semicolon should be at end after comment');
        assert.ok(/\/\/.*,\s*$/.test(l2), 'Comma should be at end after comment');
        assert.ok(!/;\s*\/\//.test(l1), 'Semicolon should not be before comment');
        assert.ok(!/,\s*\/\//.test(l2), 'Comma should not be before comment');
    });

    it('should remove comma before comment in enum remove mode', () => {
        const input = `enum E {
    A = 1, // a
    B = 2 // b
}`;
        const output = formatWithTrailingComma(input, 'remove');
        const lines = output.split('\n');
        const l1 = lines[1] || '';
        const l2 = lines[2] || '';

        assert.ok(/\/\/.*\s*$/.test(l1), 'Comment should remain at line end');
        assert.ok(/\/\/.*\s*$/.test(l2), 'Comment should remain at line end');
        assert.ok(!/,\s*\/\//.test(l1), 'Comma should be removed before comment');
        assert.ok(!/,\s*$/.test(l2), 'No trailing comma for remove mode');
    });
});
