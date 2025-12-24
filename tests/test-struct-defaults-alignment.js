// Test script for struct default values alignment configuration
const Module = require('module');
const originalRequire = Module.prototype.require;

// Mock vscode module
const vscode = {
    workspace: {
        getConfiguration: (section) => {
            if (section === 'thrift.format') {
                return {
                    get: (key, def) => {
                        // Test configurations
                        const testConfigs = {
                            trailingComma: 'preserve',
                            alignTypes: true,
                            alignNames: true,
                            alignAssignments: true,

                            alignStructDefaults: false, // This is the key test - defaults should not align
                            alignAnnotations: true,
                            alignComments: true,
                            indentSize: 4,
                            maxLineLength: 100,
                            collectionStyle: 'preserve'
                        };
                        return testConfigs[key] !== undefined ? testConfigs[key] : def;
                    }
                };
            } else if (section === 'thrift-support.formatting') {
                return {get: (key, def) => def};
            }
            return {get: () => undefined};
        }
    },
    TextEdit: {
        replace: (range, newText) => ({range, newText})
    },
    Range: function (startLine, startChar, endLine, endChar) {
        return {
            start: {line: startLine, character: startChar},
            end: {line: endLine, character: endChar}
        };
    }
};

// Override require to provide our mock
Module.prototype.require = function (id) {
    if (id === 'vscode') return vscode;
    return originalRequire.apply(this, arguments);
};

const {ThriftFormattingProvider} = require('../out/src/formattingProvider.js');

// Restore original require
Module.prototype.require = originalRequire;

console.log('Testing struct default values alignment configuration...\n');

// Test case 1: Default configuration (alignStructDefaults = false)
function testDefaultConfiguration() {
    console.log('='.repeat(60));
    console.log('Test 1: Default configuration (alignStructDefaults = false)');
    console.log('='.repeat(60));

    const testCode = `struct User {
    1: required string name
    2: optional i32 age = 25
    3: required bool isActive
    4: optional string email = "default@example.com"
    5: required double score = 0.0
    6: optional Status status = Status.ACTIVE
}`;

    console.log('Original code:');
    console.log(testCode);
    console.log('\nExpected: Default values should NOT be aligned');

    const formatter = new ThriftFormattingProvider();
    const mockDocument = {
        getText: () => testCode,
        lineCount: testCode.split('\n').length
    };

    const mockRange = new vscode.Range(0, 0, mockDocument.lineCount - 1, 0);
    const mockOptions = {insertSpaces: true, tabSize: 4};

    try {
        const edits = formatter.provideDocumentRangeFormattingEdits(mockDocument, mockRange, mockOptions);

        if (edits && edits.length > 0) {
            const formattedCode = edits[0].newText;
            console.log('\nFormatted code:');
            console.log(formattedCode);

            // Analyze alignment
            const lines = formattedCode.split('\n');
            const fieldLines = lines.filter(line => line.trim().match(/^\d+:/));

            console.log('\nAlignment analysis:');
            fieldLines.forEach((line, index) => {
                const hasDefault = line.includes(' = ');
                const equalsPos = hasDefault ? line.indexOf(' = ') : -1;
                console.log(`Line ${index + 1}: ${hasDefault ? 'HAS DEFAULT' : 'NO DEFAULT'} ${hasDefault ? `(= at pos ${equalsPos})` : ''}`);
                console.log(`  "${line}"`);
            });

        } else {
            console.log('No formatting edits returned');
        }
    } catch (error) {
        console.error('Error during formatting:', error);
    }
}

// Test case 2: Enable alignStructDefaults
function testEnabledConfiguration() {
    console.log('\n' + '='.repeat(60));
    console.log('Test 2: Enabled configuration (alignStructDefaults = true)');
    console.log('='.repeat(60));

    // Override configuration for this test
    const originalGetConfig = vscode.workspace.getConfiguration;
    vscode.workspace.getConfiguration = (section) => {
        if (section === 'thrift.format') {
            return {
                get: (key, def) => {
                    const testConfigs = {
                        trailingComma: 'preserve',
                        alignTypes: true,
                        alignNames: true,
                        alignAssignments: true,

                        alignStructDefaults: true, // Enable alignment for this test
                        alignAnnotations: true,
                        alignComments: true,
                        indentSize: 4,
                        maxLineLength: 100,
                        collectionStyle: 'preserve'
                    };
                    return testConfigs[key] !== undefined ? testConfigs[key] : def;
                }
            };
        } else if (section === 'thrift-support.formatting') {
            return {get: (key, def) => def};
        }
        return {get: () => undefined};
    };

    const testCode = `struct User {
    1: required string name
    2: optional i32 age = 25
    3: required bool isActive
    4: optional string email = "default@example.com"
    5: required double score = 0.0
    6: optional Status status = Status.ACTIVE
}`;

    console.log('Original code:');
    console.log(testCode);
    console.log('\nExpected: Default values SHOULD be aligned');

    const formatter = new ThriftFormattingProvider();
    const mockDocument = {
        getText: () => testCode,
        lineCount: testCode.split('\n').length
    };

    const mockRange = new vscode.Range(0, 0, mockDocument.lineCount - 1, 0);
    const mockOptions = {insertSpaces: true, tabSize: 4};

    try {
        const edits = formatter.provideDocumentRangeFormattingEdits(mockDocument, mockRange, mockOptions);

        if (edits && edits.length > 0) {
            const formattedCode = edits[0].newText;
            console.log('\nFormatted code:');
            console.log(formattedCode);

            // Analyze alignment
            const lines = formattedCode.split('\n');
            const fieldLines = lines.filter(line => line.trim().match(/^\d+:/));

            console.log('\nAlignment analysis:');
            const defaultLines = fieldLines.filter(line => line.includes(' = '));
            if (defaultLines.length > 1) {
                const equalsPositions = defaultLines.map(line => line.indexOf(' = '));
                const allSamePosition = equalsPositions.every(pos => pos === equalsPositions[0]);
                console.log(`Default value alignment: ${allSamePosition ? 'ALIGNED' : 'NOT ALIGNED'}`);
                console.log(`Equals positions: [${equalsPositions.join(', ')}]`);
            }

            fieldLines.forEach((line, index) => {
                const hasDefault = line.includes(' = ');
                const equalsPos = hasDefault ? line.indexOf(' = ') : -1;
                console.log(`Line ${index + 1}: ${hasDefault ? 'HAS DEFAULT' : 'NO DEFAULT'} ${hasDefault ? `(= at pos ${equalsPos})` : ''}`);
                console.log(`  "${line}"`);
            });

        } else {
            console.log('No formatting edits returned');
        }
    } catch (error) {
        console.error('Error during formatting:', error);
    }

    // Restore original configuration
    vscode.workspace.getConfiguration = originalGetConfig;
}

// Test case 3: Mixed scenario with annotations
function testMixedScenario() {
    console.log('\n' + '='.repeat(60));
    console.log('Test 3: Mixed scenario with annotations and defaults');
    console.log('='.repeat(60));

    const testCode = `struct ComplexUser {
    1: required string name (go.tag='json:"name"')
    2: optional i32 age = 25
    3: required bool isActive (go.tag='json:"active"')
    4: optional string email = "default@example.com" (go.tag='json:"email"')
    5: required double score = 0.0
}`;

    console.log('Original code:');
    console.log(testCode);
    console.log('\nExpected: Annotations should align, but default values should NOT align');

    const formatter = new ThriftFormattingProvider();
    const mockDocument = {
        getText: () => testCode,
        lineCount: testCode.split('\n').length
    };

    const mockRange = new vscode.Range(0, 0, mockDocument.lineCount - 1, 0);
    const mockOptions = {insertSpaces: true, tabSize: 4};

    try {
        const edits = formatter.provideDocumentRangeFormattingEdits(mockDocument, mockRange, mockOptions);

        if (edits && edits.length > 0) {
            const formattedCode = edits[0].newText;
            console.log('\nFormatted code:');
            console.log(formattedCode);

        } else {
            console.log('No formatting edits returned');
        }
    } catch (error) {
        console.error('Error during formatting:', error);
    }
}

// Run all tests
testDefaultConfiguration();
testEnabledConfiguration();
testMixedScenario();

console.log('\n' + '='.repeat(60));
console.log('Struct default values alignment tests completed!');
console.log('='.repeat(60));
