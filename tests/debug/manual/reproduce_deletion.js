const Module = require('module');
const originalRequire = Module.prototype.require;

Module.prototype.require = function (path) {
    if (path === 'vscode') {
        return {
            workspace: {
                getConfiguration: () => ({
                    get: (key, def) => def
                })
            },
            Range: class { constructor(s, e) { this.start = s; this.end = e; } },
            Position: class { constructor(l, c) { this.line = l; this.character = c; } },
            TextEdit: {
                replace: (range, text) => ({ range, newText: text })
            },
            window: {
                showErrorMessage: console.error
            },
            DocumentFormattingEditProvider: class { },
            DocumentRangeFormattingEditProvider: class { }
        };
    }
    return originalRequire.apply(this, arguments);
};

const { ThriftFormattingProvider } = require('../out/formattingProvider');

const vscode = require('vscode');
const provider = new ThriftFormattingProvider();

const input = `
const map<string,string> M1 = {
  "key": "val"
}
`;

const options = {
    insertSpaces: true,
    tabSize: 4
};

// Mock document
const document = {
    getText: () => input,
    lineAt: (i) => ({ text: input.split('\n')[i] }),
    positionAt: (offset) => new vscode.Position(0, 0) // Dummy
};

const edits = provider.provideDocumentFormattingEdits(document, options, null);
const output = edits[0].newText;

console.log("Input:");
console.log(input);
console.log("Output:");
console.log(output);

if (output.includes('"key": "val"')) {
    console.log("SUCCESS: Code preserved.");
} else {
    console.log("FAILURE: Code deleted.");
}
