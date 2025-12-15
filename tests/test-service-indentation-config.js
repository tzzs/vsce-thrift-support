const assert = require('assert');
const path = require('path');
const fs = require('fs');

// Mock VS Code API
const vscode = {
    window: {
        showInformationMessage: () => { },
        showErrorMessage: () => { },
    },
    Position: class { constructor(currLine, currChar) { this.line = currLine; this.character = currChar; } },
    Range: class { constructor(start, end) { this.start = start; this.end = end; } },
    TextEdit: class { static replace(range, newText) { return { range, newText }; } },
    Uri: { file: (f) => ({ fsPath: f, toString: () => f }) },
    workspace: {
        openTextDocument: async (uri) => ({
            uri,
            getText: () => fs.readFileSync(uri.fsPath, 'utf8'),
            lineAt: (line) => ({ text: '' })
        }),
        getConfiguration: () => ({ get: (k, d) => d })
    }
};

const Module = require('module');
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
    if (request === 'vscode') { return vscode; }
    return originalLoad.apply(this, arguments);
};

// Import formatter
const { ThriftFormattingProvider } = require('../out/formattingProvider.js');

async function testServiceIndentation() {
    console.log('Testing Service Indentation with indentSize = 4');

    const input = `service UserService {
  User createUser(1: User user)
}`;

    const expected = `service UserService {
    User createUser(1: User user)
}`;

    // Create temp file
    const tempFile = path.resolve(__dirname, 'temp_repro.thrift');
    fs.writeFileSync(tempFile, input);

    try {
        const provider = new ThriftFormattingProvider();
        const uri = vscode.Uri.file(tempFile);
        const doc = await vscode.workspace.openTextDocument(uri);
        const range = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(100, 0));

        // Format with indentSize: 4
        const edits = await provider.provideDocumentRangeFormattingEdits(doc, range, {
            insertSpaces: true,
            tabSize: 4,
            indentSize: 4
        }, {});

        const formatted = edits[0].newText.trim();
        const expectedTrimmed = expected.trim();

        // Extract indentation of the method line
        const methodLine = formatted.split('\n')[1];
        const indentation = methodLine.match(/^\s*/)[0].length;

        console.log('Formatted output:\n' + formatted);
        console.log('Indentation of method: ' + indentation);

        if (indentation !== 4) {
            throw new Error(`Expected 4 spaces indentation, got ${indentation}`);
        }
        console.log('Test Passed!');

    } finally {
        if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    }
}

testServiceIndentation().catch(err => {
    console.error(err);
    process.exit(1);
});
