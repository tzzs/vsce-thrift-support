// Mock VSCode module before requiring anything
const Module = require('module');
const originalLoad = Module._load;

let vscodeMock;

Module._load = function(request, parent, isMain) {
    if (request === 'vscode') {
        if (!vscodeMock) {
            vscodeMock = {
                Range: class Range {
                    constructor(start, end) {
                        this.start = start;
                        this.end = end;
                    }
                },
                Position: class Position {
                    constructor(line, character) {
                        this.line = line;
                        this.character = character;
                    }
                },
                TextEdit: class TextEdit {
                    static replace(range, newText) {
                        return { range, newText };
                    }
                },
                Uri: {
                    file: (filePath) => ({
                        fsPath: filePath,
                        path: filePath,
                        with: function(options) {
                            return { ...this, ...options };
                        }
                    })
                },
                workspace: {
                    openTextDocument: async (uri) => {
                        const fs = require('fs');
                        const content = fs.readFileSync(uri.fsPath, 'utf8');
                        const lines = content.split('\n');
                        
                        return {
                            getText: (range) => {
                                if (!range) return content;
                                
                                const startLine = range.start.line;
                                const endLine = range.end.line;
                                const startChar = range.start.character;
                                const endChar = range.end.character;
                                
                                // Validate line indices
                                if (startLine < 0 || startLine >= lines.length || 
                                    endLine < 0 || endLine >= lines.length) {
                                    console.log(`Invalid range: startLine=${startLine}, endLine=${endLine}, lines.length=${lines.length}`);
                                    return '';
                                }
                                
                                if (startLine === endLine) {
                                    const line = lines[startLine];
                                    return line.substring(startChar, endChar);
                                }
                                
                                let result = '';
                                for (let i = startLine; i <= endLine; i++) {
                                    if (i === startLine) {
                                        result += lines[i].substring(startChar);
                                    } else if (i === endLine) {
                                        result += '\n' + lines[i].substring(0, endChar);
                                    } else {
                                        result += '\n' + lines[i];
                                    }
                                }
                                return result;
                            },
                            positionAt: (offset) => {
                                let currentOffset = 0;
                                for (let i = 0; i < lines.length; i++) {
                                    const lineLength = lines[i].length + 1;
                                    if (currentOffset + lineLength > offset) {
                                        return new vscodeMock.Position(i, offset - currentOffset);
                                    }
                                    currentOffset += lineLength;
                                }
                                return new vscodeMock.Position(lines.length - 1, lines[lines.length - 1].length);
                            },
                            lineCount: lines.length,
                            uri: uri
                        };
                    },
                    getConfiguration: (section) => {
                        console.log(`Getting configuration for: ${section}`);
                        return {
                            get: (key, defaultValue) => {
                                console.log(`  Getting config: ${key} = ${defaultValue}`);
                                return defaultValue;
                            }
                        };
                    }
                }
            };
        }
        return vscodeMock;
    }
    return originalLoad.apply(this, arguments);
};

const path = require('path');
const fs = require('fs');
const { ThriftFormattingProvider } = require('../out/formatting-provider.js');

async function debugFormatDetailed() {
    const vscode = vscodeMock; // Use the mock
    
    // Test different inputs
    const testCases = [
        'struct User{1:i32 id;2:string name;}',
        'struct User {\n  1: i32 id;\n  2: string name;\n}',
        'struct User { 1: i32 id; 2: string name; }',
        'service Calculator { i32 add(1: i32 a, 2: i32 b) }'
    ];

    for (let i = 0; i < testCases.length; i++) {
        const input = testCases[i];
        console.log(`\n=== Test Case ${i + 1} ===`);
        console.log('Input:', JSON.stringify(input));
        
        const tempFile = 'test-files/debug-format-detailed.temp.thrift';
        
        // 确保测试目录存在
        const testDir = path.dirname(tempFile);
        if (!fs.existsSync(testDir)) {
            fs.mkdirSync(testDir, { recursive: true });
        }
        
        fs.writeFileSync(tempFile, input);
        
        try {
            const provider = new ThriftFormattingProvider();
            const uri = vscode.Uri.file(path.resolve(tempFile));
            const document = await vscode.workspace.openTextDocument(uri);
            
            console.log('Document content:', JSON.stringify(document.getText()));
            
            const fullRange = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(1000, 0));
            
            console.log('Requesting formatting...');
            const edits = await provider.provideDocumentRangeFormattingEdits(
                document, 
                fullRange, 
                {
                    tabSize: 4,
                    insertSpaces: true
                }, 
                {}
            );
            
            console.log('Formatting results:');
            console.log('Number of edits:', edits ? edits.length : 0);
            if (edits && edits.length > 0) {
                edits.forEach((edit, idx) => {
                    console.log(`Edit ${idx + 1}:`);
                    console.log(`  Range: ${edit.range.start.line}:${edit.range.start.character} - ${edit.range.end.line}:${edit.range.end.character}`);
                    console.log(`  New text: ${JSON.stringify(edit.newText)}`);
                });
                
                // Apply edits to see final result
                let formattedText = document.getText();
                if (edits && edits.length > 0) {
                    // Apply edits in reverse order to maintain correct positions
                    const sortedEdits = [...edits].sort((a, b) => {
                        const aStart = a.range.start.line * 10000 + a.range.start.character;
                        const bStart = b.range.start.line * 10000 + b.range.start.character;
                        return bStart - aStart;
                    });
                    
                    sortedEdits.forEach(edit => {
                        const lines = formattedText.split('\n');
                        const startLine = edit.range.start.line;
                        const endLine = edit.range.end.line;
                        const startChar = edit.range.start.character;
                        const endChar = edit.range.end.character;
                        
                        if (startLine >= 0 && startLine < lines.length && endLine >= 0 && endLine < lines.length) {
                            const before = lines.slice(0, startLine);
                            const after = lines.slice(endLine + 1);
                            const currentLine = lines[startLine];
                            
                            let newLines;
                            if (startLine === endLine) {
                                const newLine = currentLine.substring(0, startChar) + edit.newText + currentLine.substring(endChar);
                                newLines = [...before, newLine, ...after];
                            } else {
                                const startPart = currentLine.substring(0, startChar);
                                const endPart = lines[endLine].substring(endChar);
                                const newContent = startPart + edit.newText + endPart;
                                newLines = [...before, newContent, ...after];
                            }
                            
                            formattedText = newLines.join('\n');
                        }
                    });
                }
                
                console.log('Final formatted result:');
                console.log(JSON.stringify(formattedText));
            } else {
                console.log('No formatting changes made');
            }
            
        } catch (error) {
            console.error('Error:', error);
            console.error('Stack:', error.stack);
        } finally {
            if (fs.existsSync(tempFile)) {
                fs.unlinkSync(tempFile);
            }
        }
    }
    
    // Restore original module loader
    Module._load = originalLoad;
}

// Run the debug function
debugFormatDetailed().catch(console.error);