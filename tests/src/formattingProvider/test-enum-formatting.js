const fs = require('fs');
const path = require('path');

// Mock vscode module
const {createVscodeMock, installVscodeMock} = require('../../test-helpers/vscode-mock');
const vscode = createVscodeMock({
    workspace: {
        getConfiguration: (section) => {
            const config = {
                'thrift-support.formatting.trailingComma': true,
                'thrift-support.formatting.alignTypes': true,
                'thrift-support.formatting.alignFieldNames': true,
                'thrift-support.formatting.alignComments': true,
                'thrift-support.formatting.alignEnumNames': true,
                'thrift-support.formatting.alignEnumEquals': true,
                'thrift-support.formatting.alignEnumValues': true,
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
const {ThriftFormattingProvider} = require('../../../out/src/formattingProvider.js');

// Restore original require
Module.prototype.require = originalRequire;

// Test enum formatting
function testEnumFormatting() {
    console.log('Testing enum formatting...');

    const formatter = new ThriftFormattingProvider();

    // Test input with unaligned enum
    const input = `enum Status {
ACTIVE=1,
INACTIVE = 2,
PENDING= 3,
SUSPENDED =4
}`;

    console.log('Input:');
    console.log(input);
    console.log('\n--- Formatted Output ---');

    // Mock document and options
    const mockDocument = {
        getText: () => input,
        lineCount: input.split('\n').length,
        lineAt: (i) => ({text: input.split('\n')[i]})
    };

    const mockOptions = {insertSpaces: true, tabSize: 4};
    const mockRange = {
        start: {line: 0, character: 0},
        end: {line: input.split('\n').length - 1, character: input.split('\n')[input.split('\n').length - 1].length}
    };

    try {
        const edits = formatter.provideDocumentRangeFormattingEdits(mockDocument, mockRange, mockOptions);
        if (edits && edits.length > 0) {
            const formatted = edits[0].newText;
            console.log(formatted);

            // Check if enum fields are properly aligned
            const lines = formatted.split('\n');
            const enumLines = lines.filter(line => line.trim().match(/^\w+\s*=\s*\d+/));

            if (enumLines.length > 0) {
                console.log('\n--- Enum field alignment check ---');
                enumLines.forEach(line => {
                    console.log(`"${line}"`);
                });

                // Check if all enum names start at the same position
                const namePositions = enumLines.map(line => line.search(/\w/));
                const allSamePosition = namePositions.every(pos => pos === namePositions[0]);

                if (allSamePosition) {
                    console.log('✓ Enum names are properly aligned');
                } else {
                    console.log('✗ Enum names are not aligned');
                }

                // Check if equals signs are aligned
                const equalsPositions = enumLines.map(line => line.indexOf('='));
                const equalsAligned = equalsPositions.every(pos => pos === equalsPositions[0]);

                if (equalsAligned) {
                    console.log('✓ Equals signs are properly aligned');
                } else {
                    console.log('✗ Equals signs are not aligned');
                }
            }
        } else {
            console.log('No formatting changes needed or formatter returned no edits');
        }
    } catch (error) {
        console.error('Error during formatting:', error);
    }
}

// Test with different alignment configurations
function testEnumAlignmentConfigurations() {
    console.log('\n\n=== Testing different alignment configurations ===');

    const configs = [
        {
            name: 'All alignment disabled',
            config: {
                alignEnumNames: false,
                alignEnumEquals: false,
                alignEnumValues: false
            }
        },
        {
            name: 'Only names aligned',
            config: {
                alignEnumNames: true,
                alignEnumEquals: false,
                alignEnumValues: false
            }
        },
        {
            name: 'Names and equals aligned',
            config: {
                alignEnumNames: true,
                alignEnumEquals: true,
                alignEnumValues: false
            }
        },
        {
            name: 'All aligned (default)',
            config: {
                alignEnumNames: true,
                alignEnumEquals: true,
                alignEnumValues: true
            }
        }
    ];

    configs.forEach(testConfig => {
        console.log(`\n--- ${testConfig.name} ---`);

        // Update vscode mock configuration
        const originalGetConfiguration = vscode.workspace.getConfiguration;
        vscode.workspace.getConfiguration = (section) => {
            return {
                get: (key) => {
                    const fullKey = section ? `${section}.${key}` : key;

                    // Check if this is one of the test config keys
                    if (key === 'alignEnumNames') {
                        return testConfig.config.alignEnumNames;
                    }
                    if (key === 'alignEnumEquals') {
                        return testConfig.config.alignEnumEquals;
                    }
                    if (key === 'alignEnumValues') {
                        return testConfig.config.alignEnumValues;
                    }

                    // Default values for other configs
                    const defaults = {
                        'thrift-support.formatting.trailingComma': true,
                        'thrift-support.formatting.alignTypes': true,
                        'thrift-support.formatting.alignFieldNames': true,
                        'thrift-support.formatting.alignComments': true,
                        'thrift-support.formatting.indentSize': 4
                    };
                    return defaults[fullKey] !== undefined ? defaults[fullKey] : true;
                }
            };
        };

        testEnumFormatting();

        // Restore original configuration
        vscode.workspace.getConfiguration = originalGetConfiguration;
    });
}

// Run tests
testEnumFormatting();
testEnumAlignmentConfigurations();

console.log('\nEnum formatting tests completed!');
