const fs = require('fs');
const path = require('path');

const vscode = {
  TextEdit: { replace: (range, text) => ({ range, newText: text }) },
  Range: class { constructor(start, end) { this.start = start; this.end = end; } },
  Position: class { constructor(line, character) { this.line = line; this.character = character; } }
};

const Module = require('module');
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === 'vscode') return vscode;
  return originalLoad.apply(this, arguments);
};

const { ThriftFormattingProvider } = require('../out/formattingProvider.js');

(async function run() {
  const provider = new ThriftFormattingProvider();
  const filePath = path.join(__dirname, '..', 'test-files', 'example.thrift');
  const uri = { fsPath: filePath };
  const doc = {
    uri,
    getText: () => fs.readFileSync(filePath, 'utf8'),
    lineAt: (line) => ({ text: fs.readFileSync(filePath, 'utf8').split('\n')[line] || '' })
  };
  const edits = await provider.provideDocumentRangeFormattingEdits(
    doc,
    new vscode.Range(new vscode.Position(0, 0), new vscode.Position(9999, 0)),
    { tabSize: 2, insertSpaces: true },
    {}
  );
  console.log('Regression edits count:', Array.isArray(edits) ? edits.length : 'not array');
})();
