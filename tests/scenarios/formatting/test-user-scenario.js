const fs = require('fs');
const path = require('path');

const {createVscodeMock, installVscodeMock} = require('../../mock_vscode.js');
const vscode = createVscodeMock({
    TextEdit: {replace: (range, text) => ({range, newText: text})},
    Range: class {
        constructor(start, end) {
            this.start = start;
            this.end = end;
        }
    },
    Position: class {
        constructor(line, character) {
            this.line = line;
            this.character = character;
        }
    },
    workspace: {
        getConfiguration: (_section) => ({get: (_key, def) => def})
    }
});
installVscodeMock(vscode);


const formatter_module = require('../../../out/formattingProvider.js');
const {ThriftFormattingProvider} = formatter_module;

async function runUserScenario() {
    const provider = new ThriftFormattingProvider();
    const file = path.join(__dirname, '..', '..', '..', 'test-files', 'example.thrift');
    const text = fs.readFileSync(file, 'utf8');
    const doc = {
        uri: {fsPath: file},
        getText: () => text,
        lineAt: (line) => ({text: text.split('\n')[line] || ''})
    };

    const edits = await provider.provideDocumentRangeFormattingEdits(
        doc,
        new vscode.Range(new vscode.Position(0, 0), new vscode.Position(9999, 0)),
        {tabSize: 2, insertSpaces: true},
        {}
    );
    console.log('user-scenario edits:', Array.isArray(edits) ? edits.length : 'not array');
}

runUserScenario().catch((e) => {
    console.error(e);
    process.exit(1);
});
