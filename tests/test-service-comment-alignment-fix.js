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

async function testServiceCommentAlignment() {
    console.log('Testing Service Comment Alignment');

    const input = `service UserService {
  /**
  * Delete user
  */
  void deleteUser(1: UserId id)
}`;

    const expected = `service UserService {
  /**
   * Delete user
   */
  void deleteUser(1: UserId id)
}`;

    // Create temp file
    const tempFile = path.resolve(__dirname, 'temp_comment_repro.thrift');
    fs.writeFileSync(tempFile, input);

    try {
        const provider = new ThriftFormattingProvider();
        const uri = vscode.Uri.file(tempFile);
        const doc = await vscode.workspace.openTextDocument(uri);
        const range = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(100, 0));

        // Format with default settings (2 spaces indent)
        const edits = await provider.provideDocumentRangeFormattingEdits(doc, range, {
            insertSpaces: true,
            tabSize: 2,
            indentSize: 2
        }, {});

        const formatted = edits[0].newText.trim();

        console.log('Formatted output:\n' + formatted);

        // Check alignment
        const lines = formatted.split('\n');
        const starLine = lines[2]; // "   * Delete user"

        // Expected: "   * Delete user"
        // The first line "  /**" starts at index 2
        // The * in /** is at index 3
        // So the * in the next line should be at index 3

        const firstLineIndent = lines[1].indexOf('/**'); // should be 2
        const starIndex = starLine.indexOf('*');

        console.log(`First line indent: ${firstLineIndent} (expected 2)`);
        console.log(`Star index: ${starIndex} (expected 3)`);

        if (starIndex !== 3) {
            throw new Error(`Expected * at index 3, got ${starIndex}`);
        }

        console.log('Test Passed!');

    } finally {
        if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    }
}

testServiceCommentAlignment().catch(err => {
    console.error(err);
    process.exit(1);
});
