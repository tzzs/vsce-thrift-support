// Test script for include file navigation functionality
// This script simulates the include navigation feature

const path = require('path');
const fs = require('fs');

// Mock VSCode API
const {createVscodeMock, installVscodeMock} = require('../../test-helpers/vscode-mock');
const vscode = createVscodeMock({
    Position: class {
        constructor(line, character) {
            this.line = line;
            this.character = character;
        }
    },
    Range: class {
        constructor(startOrStartLine, startCharOrEnd, endLine, endChar) {
            if (startOrStartLine instanceof vscode.Position && startCharOrEnd instanceof vscode.Position) {
                this.start = startOrStartLine;
                this.end = startCharOrEnd;
            } else {
                this.start = new vscode.Position(startOrStartLine, startCharOrEnd);
                this.end = new vscode.Position(endLine, endChar);
            }
        }
    },
    Location: class {
        constructor(uri, position) {
            this.uri = uri;
            this.range = {start: position, end: position};
        }
    },
    Uri: {
        file: (path) => ({fsPath: path, toString: () => `file://${path}`})
    },
    workspace: {
        fs: {
            stat: async (uri) => {
                return new Promise((resolve, reject) => {
                    fs.stat(uri.fsPath, (err, stats) => {
                        if (err) reject(err);
                        else resolve(stats);
                    });
                });
            }
        },
        openTextDocument: async (uri) => {
            const content = fs.readFileSync(uri.fsPath, 'utf8');
            return {
                uri: uri,
                getText: () => content,
                lineAt: (line) => {
                    const lines = content.split('\n');
                    return {
                        text: lines[line] || '',
                        range: {
                            start: new vscode.Position(line, 0),
                            end: new vscode.Position(line, lines[line]?.length || 0)
                        }
                    };
                },
                getWordRangeAtPosition: (position) => {
                    const lines = content.split('\n');
                    const line = lines[position.line] || '';
                    const char = position.character;

                    // Simple word boundary detection
                    let start = char;
                    let end = char;

                    // Find start of word
                    while (start > 0 && /\w/.test(line[start - 1])) {
                        start--;
                    }

                    // Find end of word
                    while (end < line.length && /\w/.test(line[end])) {
                        end++;
                    }

                    if (start === end) return undefined;

                    return {
                        start: new vscode.Position(position.line, start),
                        end: new vscode.Position(position.line, end)
                    };
                },
                getText: (range) => {
                    if (!range) return content;
                    const lines = content.split('\n');
                    const line = lines[range.start.line] || '';
                    return line.substring(range.start.character, range.end.character);
                }
            };
        },
        findFiles: async (glob, exclude) => {
            // Mock implementation: return URIs of .thrift files under tests/test-files
            const dir = path.resolve(__dirname, '..', '..', 'test-files');
            let entries = [];
            try {
                entries = fs.readdirSync(dir);
            } catch (e) {
                entries = [];
            }
            return entries
                .filter((f) => f.endsWith('.thrift'))
                .map((f) => vscode.Uri.file(path.join(dir, f)));
        }
    }
});
installVscodeMock(vscode);


// Intercept require calls to provide our mock
// Import the definition provider
const {ThriftDefinitionProvider} = require('../../../out/src/definitionProvider.js');

async function testIncludeNavigation() {
    console.log('Testing include file navigation...');

    const provider = new ThriftDefinitionProvider();

    // Test case 1: Navigate to shared.thrift from example.thrift
    console.log('\n1. Testing navigation from example.thrift to shared.thrift');

    try {
        const examplePath = path.join(__dirname, '..', '..', 'test-files', 'example.thrift');
        const exampleUri = vscode.Uri.file(examplePath);
        const exampleDoc = await vscode.workspace.openTextDocument(exampleUri);

        // Find the include line
        const content = exampleDoc.getText();
        const lines = content.split('\n');
        let includeLine = -1;
        let includeCharPos = -1;

        for (let i = 0; i < lines.length; i++) {
            const match = lines[i].match(/include\s+["]([^"']+)["]/);
            if (match && match[1] === 'shared.thrift') {
                includeLine = i;
                includeCharPos = lines[i].indexOf('shared.thrift') + 5; // Middle of filename
                break;
            }
        }

        if (includeLine >= 0) {
            const position = new vscode.Position(includeLine, includeCharPos);
            const definition = await provider.provideDefinition(exampleDoc, position, {});

            if (definition) {
                console.log('✅ Successfully found definition for shared.thrift');
                console.log(`   Target: ${definition.uri.toString()}`);

                // Verify the target file exists
                const targetExists = fs.existsSync(definition.uri.fsPath);
                if (targetExists) {
                    console.log('✅ Target file exists and is accessible');
                } else {
                    console.log('❌ Target file does not exist');
                }
            } else {
                console.log('❌ No definition found for shared.thrift include');
            }
        } else {
            console.log('❌ Could not find include statement for shared.thrift');
        }
    } catch (error) {
        console.log('❌ Error testing include navigation:', error.message);
    }

    // Test case 2: Test cursor position outside filename (should not navigate)
    console.log('\n2. Testing cursor outside filename (should not navigate)');

    try {
        const examplePath = path.join(__dirname, '..', '..', 'test-files', 'example.thrift');
        const exampleUri = vscode.Uri.file(examplePath);
        const exampleDoc = await vscode.workspace.openTextDocument(exampleUri);

        // Find the include line and position cursor on 'include' keyword
        const content = exampleDoc.getText();
        const lines = content.split('\n');
        let includeLine = -1;

        for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes('include') && lines[i].includes('shared.thrift')) {
                includeLine = i;
                break;
            }
        }

        if (includeLine >= 0) {
            const position = new vscode.Position(includeLine, 2); // On 'include' keyword
            const definition = await provider.provideDefinition(exampleDoc, position, {});

            if (!definition) {
                console.log('✅ Correctly ignored cursor outside filename');
            } else {
                console.log('❌ Unexpectedly found definition when cursor was outside filename');
            }
        }
    } catch (error) {
        console.log('❌ Error in negative test:', error.message);
    }

    // Test case 3: Test non-existent include file
    console.log('\n3. Testing non-existent include file');

    try {
        // Create a temporary test file with non-existent include
        const testContent = 'include "non-existent-file.thrift"\n\nstruct Test {\n  1: string name\n}';
        const testPath = path.join(__dirname, 'temp-test.thrift');
        fs.writeFileSync(testPath, testContent);

        const testUri = vscode.Uri.file(testPath);
        const testDoc = await vscode.workspace.openTextDocument(testUri);

        const position = new vscode.Position(0, 15); // Middle of "non-existent-file.thrift"
        const definition = await provider.provideDefinition(testDoc, position, {});

        if (!definition) {
            console.log('✅ Correctly handled non-existent include file');
        } else {
            console.log('❌ Unexpectedly found definition for non-existent file');
        }

        // Clean up
        fs.unlinkSync(testPath);
    } catch (error) {
        console.log('❌ Error testing non-existent file:', error.message);
    }

    console.log('\n🎉 Include navigation tests completed!');
}

// Run the tests
testIncludeNavigation().catch(console.error);
