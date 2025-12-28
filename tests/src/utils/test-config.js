const path = require('path');

// Mock vscode module
const {createVscodeMock, installVscodeMock} = require('../../mock_vscode.js');
const vscode = createVscodeMock({
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
    TextEdit: class {
        constructor(range, newText) {
            this.range = range;
            this.newText = newText;
        }
        static replace(range, newText) {
            return new vscode.TextEdit(range, newText);
        }
    },
    Uri: {
        file: (path) => ({ fsPath: path, path })
    },
    workspace: {
        openTextDocument: async (uri) => {
            const fs = require('fs');
            const content = fs.readFileSync(uri.fsPath, 'utf8');
            const textLines = content.split('\n');
            return {
                getText: () => content,
                lineCount: textLines.length,
                lineAt: (line) => ({
                    text: textLines[line] || '',
                    range: new vscode.Range(new vscode.Position(line, 0), new vscode.Position(line, (textLines[line] || '').length))
                }),
                positionAt: (offset) => {
                    let currentOffset = 0;
                    for (let line = 0; line < textLines.length; line++) {
                        const lineLength = textLines[line].length + 1; // +1 for newline
                        if (offset <= currentOffset + lineLength - 1) {
                            const character = offset - currentOffset;
                            return new vscode.Position(line, Math.max(0, character));
                        }
                        currentOffset += lineLength;
                    }
                    return new vscode.Position(textLines.length - 1, textLines[textLines.length - 1].length);
                }
            };
        },
        getConfiguration: (section) => {
            console.log('Getting configuration for section:', section);
            return {
                get: (key, defaultValue) => {
                    console.log('Getting config key:', key, 'default:', defaultValue);
                    const config = {
                        'trailingComma': 'add',
                        'alignTypes': true,
                        'alignFieldNames': true,
                        'insertSpaces': true,
                        'indentSize': 4,
                        'alignNames': true,
                        'alignStructDefaults': false,
                        'alignEnumEquals': true,
                        'alignEnumValues': true,
                        'alignAnnotations': true,
                        'alignStructAnnotations': true,
                        'alignComments': true,
                        'maxLineLength': 100,
                        'collectionStyle': 'preserve'
                    };
                    const value = config[key] !== undefined ? config[key] : defaultValue;
                    console.log('Config value for', key, ':', value);
                    return value;
                }
            };
        }
    },
    languages: {
        registerDocumentFormattingEditProvider: () => {},
        registerDocumentRangeFormattingEditProvider: () => {}
    }
});
installVscodeMock(vscode);


// Mock global vscode
global.vscode = vscode;

// Override Module._load to intercept vscode requires
// Load the formatting provider
const { ThriftFormattingProvider } = require('../../../out/formattingProvider');

async function testConfig() {
    const fs = require('fs');
    const testContent = 'struct User { 1: i32 id; 2: string name; }';
    const tempFile = 'test-config.thrift';
    
    fs.writeFileSync(tempFile, testContent);
    
    try {
        const provider = new ThriftFormattingProvider();
        const uri = vscode.Uri.file(path.resolve(tempFile));
        const document = await vscode.workspace.openTextDocument(uri);
        
        const range = new vscode.Range(
            new vscode.Position(0, 0),
            new vscode.Position(document.lineCount - 1, document.lineAt(document.lineCount - 1).text.length)
        );
        
        const edits = await provider.provideDocumentRangeFormattingEdits(
            document,
            range,
            {
                tabSize: 4,
                insertSpaces: true,
                indentSize: 4
            }
        );
        
        console.log('Edits returned:', edits.length);
        if (edits.length > 0) {
            console.log('First edit:', edits[0].newText);
        }
        
    } finally {
        if (fs.existsSync(tempFile)) {
            fs.unlinkSync(tempFile);
        }
    }
}

testConfig().catch(console.error);