const fs = require('fs');
const path = require('path');

// Mock VSCode API
const {createVscodeMock, installVscodeMock} = require('../../mock_vscode.js');
const vscode = createVscodeMock({
    Uri: {
        file: (path) => ({fsPath: path, scheme: 'file'})
    },
    Position: class {
        constructor(line, character) {
            this.line = line;
            this.character = character;
        }
    },
    Range: class {
        constructor(start, end) {
            this.start = start;
            this.end = end;
        }
    },
    Location: class {
        constructor(uri, position) {
            this.uri = uri;
            this.range = {start: position, end: position};
        }
    },
    workspace: {
        fs: {
            stat: async (uri) => {
                try {
                    return fs.statSync(uri.fsPath);
                } catch (error) {
                    throw error;
                }
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

                    // Simple word boundary detection (letters, numbers, underscores)
                    let start = char;
                    let end = char;

                    while (start > 0 && /\w/.test(line[start - 1])) {
                        start--;
                    }

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
        findFiles: async (glob) => {
            // naive implementation: search test-files directory for .thrift files
            const dir = path.resolve(__dirname, '..', '..', 'test-files');
            let entries = [];
            try {
                entries = fs.readdirSync(dir);
            } catch {
            }
            return entries.filter(f => f.endsWith('.thrift')).map(f => ({fsPath: path.join(dir, f)}));
        }
    }
});
installVscodeMock(vscode);


// Ensure child modules that require('vscode') receive our mock
// Import the definition provider (will pick up the mocked vscode)
const {ThriftDefinitionProvider} = require('../../../out/definitionProvider.js');
// After loading, restore the loader to avoid side effects on other tests

async function testIncludeFilenameDetection() {
    console.log('Testing include filename detection with dots...');

    const provider = new ThriftDefinitionProvider();

    // Create a test document with include statement
    const testContent = 'include "shared.thrift"\n';
    const testDocument = {
        uri: vscode.Uri.file(path.join(__dirname, 'test-include.thrift')),
        getText: () => testContent,
        lineAt: (line) => {
            const lines = testContent.split('\n');
            return {
                text: lines[line] || '',
                range: {start: new vscode.Position(line, 0), end: new vscode.Position(line, lines[line]?.length || 0)}
            };
        },
        getWordRangeAtPosition: (position) => {
            const lines = testContent.split('\n');
            const line = lines[position.line] || '';
            const char = position.character;

            // This simulates VSCode's default behavior - only alphanumeric
            let start = char;
            let end = char;

            while (start > 0 && /\w/.test(line[start - 1])) {
                start--;
            }

            while (end < line.length && /\w/.test(line[end])) {
                end++;
            }

            if (start === end) return undefined;

            return {
                start: new vscode.Position(position.line, start),
                end: new vscode.Position(position.line, end)
            };
        }
    };

    console.log('\n1. Testing cursor on "shared" part of "shared.thrift"');
    try {
        // Position cursor on "shared" (character 9)
        const position1 = new vscode.Position(0, 9);
        const result1 = await provider.provideDefinition(testDocument, position1, null);

        if (result1) {
            console.log('✅ Successfully detected include file from "shared" part');
            console.log('   Target:', result1.uri.fsPath);
        } else {
            console.log('❌ Failed to detect include file from "shared" part');
        }
    } catch (error) {
        console.log('❌ Error testing "shared" part:', error.message);
    }

    console.log('\n2. Testing cursor on "." part of "shared.thrift"');
    try {
        // Position cursor on "." (character 15)
        const position2 = new vscode.Position(0, 15);
        const result2 = await provider.provideDefinition(testDocument, position2, null);

        if (result2) {
            console.log('✅ Successfully detected include file from "." part');
            console.log('   Target:', result2.uri.fsPath);
        } else {
            console.log('❌ Failed to detect include file from "." part');
        }
    } catch (error) {
        console.log('❌ Error testing "." part:', error.message);
    }

    console.log('\n3. Testing cursor on "thrift" part of "shared.thrift"');
    try {
        // Position cursor on "thrift" (character 17)
        const position3 = new vscode.Position(0, 17);
        const result3 = await provider.provideDefinition(testDocument, position3, null);

        if (result3) {
            console.log('✅ Successfully detected include file from "thrift" part');
            console.log('   Target:', result3.uri.fsPath);
        } else {
            console.log('❌ Failed to detect include file from "thrift" part');
        }
    } catch (error) {
        console.log('❌ Error testing "thrift" part:', error.message);
    }

    console.log('\n🎉 Include filename detection tests completed!');
}

// Run the test
testIncludeFilenameDetection().catch(console.error);
