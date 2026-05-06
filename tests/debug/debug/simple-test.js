const fs = require('fs');
const path = require('path');

// Minimal vscode mock
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


// Hook require('vscode')
const {ThriftFormattingProvider} = require('../out/formatting-bridge/index.js');

function resetRequireCache(moduleName) {
    Object.keys(require.cache).forEach((key) => {
        if (key.includes(moduleName)) delete require.cache[key];
    });
}

async function run() {
    resetRequireCache('out/formatting-bridge/index.js');

    const provider = new ThriftFormattingProvider();

    const filePath = path.join(__dirname, '..', 'test-files', 'example.thrift');
    const text = fs.readFileSync(filePath, 'utf8');
    const doc = {
        uri: {fsPath: filePath},
        getText: () => text,
        lineAt: (line) => ({text: text.split('\n')[line] || ''})
    };

    const fullRange = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(9999, 0));
    const edits = await provider.provideDocumentRangeFormattingEdits(doc, fullRange, {
        tabSize: 2,
        insertSpaces: true
    }, {});

    if (!Array.isArray(edits)) {
        console.error('Formatting edits not returned as array');
        process.exit(1);
    }

    console.log('simple-test OK, edits:', edits.length);
}

run().catch((e) => {
    console.error(e);
    process.exit(1);
});
