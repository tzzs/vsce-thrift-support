// Test script for vscode-style formatting using ThriftFormattingProvider
const path = require('path');
const fs = require('fs');

// Mock minimal VS Code API used by the formatter
const {createVscodeMock, installVscodeMock} = require('../../test-helpers/vscode-mock');
const vscode = createVscodeMock({
    window: {
        showInformationMessage: (...args) => console.log('[Info]', ...args),
        showErrorMessage: (...args) => console.error('[Error]', ...args),
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
    TextEdit: class {
        static replace(range, newText) {
            return {range, newText};
        }
    },
    Uri: {
        file: (fsPath) => ({fsPath, toString: () => `file://${fsPath}`})
    },
    workspace: {
        openTextDocument: async (uri) => {
            const text = fs.readFileSync(uri.fsPath, 'utf8');
            const lines = text.split('\n');
            return {
                uri,
                getText: () => text,
                lineAt: (line) => ({text: lines[line] || ''})
            };
        },
        getConfiguration: (_section) => ({
            get: (_key, def) => def,
        }),
    }
});
installVscodeMock(vscode);


// Mock require('vscode') inside formatter
// Import the formatter provider (compiled output)
const {ThriftFormattingProvider} = require('../../../out/src/formattingProvider.js');

(async function run() {
    const provider = new ThriftFormattingProvider();
    const examplePath = path.join(__dirname, '..', '..', 'test-files', 'example.thrift');
    const exampleUri = vscode.Uri.file(examplePath);
    const doc = await vscode.workspace.openTextDocument(exampleUri);

    const fullRange = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(1000, 0));
    const edits = await provider.provideDocumentRangeFormattingEdits(doc, fullRange, {
        tabSize: 2,
        insertSpaces: true
    }, {});

    if (!Array.isArray(edits)) {
        console.error('✗ Expected an array of edits from formatting provider');
        process.exit(1);
    }

    console.log('✓ VSCode formatting test executed');
})();
