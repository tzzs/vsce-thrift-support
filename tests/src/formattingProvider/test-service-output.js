const fs = require('fs');
const path = require('path');

// Mock VSCode API
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
        static replace(range, newText) {
            return {range, newText};
        }
    },
    workspace: {
        getConfiguration: (section) => {
            if (section === 'thrift.format') {
                return {
                    get: (key, def) => {
                        switch (key) {
                            case 'alignTypes': return true;
                            case 'alignFieldNames': return true;
                            case 'trailingComma': return 'add';
                            case 'indentSize': return 4;
                            default: return def;
                        }
                    }
                };
            }
            return { get: (key, def) => def };
        },
    }
});
installVscodeMock(vscode);


// Mock require('vscode')
try {
    const {ThriftFormattingProvider} = require('../../../out/src/formattingProvider.js');
    
    const provider = new ThriftFormattingProvider();
    
    // Test service formatting
    const document = {
        getText: () => 'service UserService{User getUser(1:i32 id);void createUser(1:User user);}',
        lineCount: 1,
        positionAt: (offset) => {
            return new vscode.Position(0, Math.min(offset, 73));
        }
    };
    
    const range = new vscode.Range(
        new vscode.Position(0, 0),
        new vscode.Position(0, 73)
    );
    
    const edits = provider.provideDocumentRangeFormattingEdits(
        document,
        range,
        { tabSize: 4, insertSpaces: true, indentSize: 4 },
        {}
    );
    
    console.log('Service formatting result:');
    console.log('Input:', document.getText());
    console.log('Output:', edits[0].newText);
    
} catch (error) {
    console.error('错误:', error.message);
    console.error('堆栈:', error.stack);
}
