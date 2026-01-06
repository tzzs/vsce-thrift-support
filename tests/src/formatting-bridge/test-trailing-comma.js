// Mock vscode module
const {createVscodeMock, installVscodeMock} = require('../../mock_vscode.js');
const vscode = createVscodeMock({
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
            return {range, newText};
        }
    }
});
installVscodeMock(vscode);


// Set up module mock before requiring formatter
// Import the formatter
const {ThriftFormattingProvider} = require('../../../out/formatting-bridge/index.js');

function testTrailingComma() {
    console.log('Testing trailing comma functionality...');

    const formatter = new ThriftFormattingProvider();

    const testCases = [
        {
            name: 'Preserve mode - keep existing commas',
            trailingComma: 'preserve',
            input: `struct User {
    1: string name,
    2: i32 age
}`,
            expectedCheck: (output) => {
                return output.includes('name,') && !output.includes('age,');
            },
            description: 'Should keep comma after name, no comma after age'
        },
        {
            name: 'Preserve mode - keep no commas',
            trailingComma: 'preserve',
            input: `struct User {
    1: string name
    2: i32 age
}`,
            expectedCheck: (output) => {
                return !output.includes('name,') && !output.includes('age,');
            },
            description: 'Should keep no commas'
        },
        {
            name: 'Add mode - add missing commas',
            trailingComma: 'add',
            input: `struct User {
    1: string name
    2: i32 age
}`,
            expectedCheck: (output) => {
                return output.includes('name,') && output.includes('age,');
            },
            description: 'Should add commas to both fields'
        },
        {
            name: 'Remove mode - remove existing commas',
            trailingComma: 'remove',
            input: `struct User {
    1: string name,
    2: i32 age,
}`,
            expectedCheck: (output) => {
                return !output.includes('name,') && !output.includes('age,');
            },
            description: 'Should remove all commas'
        },
        {
            name: 'Enum preserve mode',
            trailingComma: 'preserve',
            input: `enum Status {
    ACTIVE = 1,
    INACTIVE = 2
}`,
            expectedCheck: (output) => {
                return output.includes('ACTIVE = 1,') && !output.includes('INACTIVE = 2,');
            },
            description: 'Should preserve enum comma state'
        },
        {
            name: 'Enum add mode',
            trailingComma: 'add',
            input: `enum Status {
    ACTIVE = 1
    INACTIVE = 2
}`,
            expectedCheck: (output) => {
                return output.includes('ACTIVE = 1,') && output.includes('INACTIVE = 2,');
            },
            description: 'Should add commas to enum values'
        },
        {
            name: 'Enum remove mode',
            trailingComma: 'remove',
            input: `enum Status {
    ACTIVE = 1,
    INACTIVE = 2,
}`,
            expectedCheck: (output) => {
                return output.includes('ACTIVE = 1') && !output.includes('ACTIVE = 1,') &&
                    output.includes('INACTIVE = 2') && !output.includes('INACTIVE = 2,');
            },
            description: 'Should remove commas from enum values'
        },
        {
            name: 'Add mode - comma tight before when annotations add padding',
            trailingComma: 'add',
            input: `struct S {
    1: string a (anno='x')
    2: i32    b (anno='y')    
}`,
            expectedCheck: (output) => {
                // Ensure both lines end with comma
                const lines = output.split('\n').filter(l => l.trim().length > 0);
                const l1 = lines[1] || '';
                const l2 = lines[2] || '';
                const noSpaceBeforeComma1 = !/\)\s+,\s*$/.test(l1) && /\),\s*$/.test(l1);
                const noSpaceBeforeComma2 = !/\)\s+,\s*$/.test(l2) && /\),\s*$/.test(l2);
                return noSpaceBeforeComma1 && noSpaceBeforeComma2;
            },
            description: 'Comma should be appended immediately after content with no preceding spaces even if alignment produced trailing spaces'
        }
    ];

    testCases.forEach(testCase => {
        console.log(`\n--- ${testCase.name} ---`);

        // Set global test configuration
        global.testTrailingComma = testCase.trailingComma;

        // Mock document and range
        const mockDocument = {
            getText: () => testCase.input
        };
        const mockRange = {start: {line: 0, character: 0}, end: {line: 4, character: 1}};
        const mockOptions = {insertSpaces: true, tabSize: 4};

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

            // Check if the output matches expected behavior
            const passes = testCase.expectedCheck(result[0].newText);
            console.log(`\nTrailing comma check: ${passes ? 'PASS' : 'FAIL'}`);
            console.log(`Description: ${testCase.description}`);

            if (!passes) {
                console.log('Expected behavior not met');
            }

        } catch (error) {
            console.log('Error:', error.message);
        }
    });

    // Clean up
    delete global.testTrailingComma;

    console.log('\nTrailing comma tests completed!');
}

testTrailingComma();
