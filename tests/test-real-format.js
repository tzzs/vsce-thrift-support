const fs = require('fs');
const path = require('path');

// Provide a minimal vscode mock for the formatter
const vscode = {
  TextEdit: { replace: (range, text) => ({ range, newText: text }) },
  Range: class {
    constructor(start, end) { this.start = start; this.end = end; }
  },
  Position: class {
    constructor(line, character) { this.line = line; this.character = character; }
  },
  workspace: {
    getConfiguration: (_section) => ({ get: (_key, def) => def }),
  }
};

const Module = require('module');
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'vscode') return vscode;
  return originalLoad.apply(this, arguments);
};

const { ThriftFormattingProvider } = require('../out/formattingProvider.js');

(async function run() {
  const formatter = new ThriftFormattingProvider();
  const filePath = path.join(__dirname, '..', 'test-files', 'example.thrift');
  const uri = { fsPath: filePath };
  const doc = {
    uri,
    getText: () => fs.readFileSync(filePath, 'utf8'),
    lineAt: (line) => ({ text: fs.readFileSync(filePath, 'utf8').split('\n')[line] || '' })
  };
  const fullRange = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(9999, 0));
  const edits = await formatter.provideDocumentRangeFormattingEdits(doc, fullRange, { tabSize: 2, insertSpaces: true }, {});
  if (!Array.isArray(edits)) {
    console.error('✗ Expected edits array');
    process.exit(1);
  }
  console.log('✓ Real format test executed');
})();
