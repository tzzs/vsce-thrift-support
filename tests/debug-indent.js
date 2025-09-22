const fs = require('fs');
const path = require('path');

const vscode = {
  TextEdit: { replace: (range, text) => ({ range, newText: text }) },
  Range: class { constructor(start, end) { this.start = start; this.end = end; } },
  Position: class { constructor(line, character) { this.line = line; this.character = character; } },
  workspace: {
    getConfiguration: (_section) => ({ get: (_key, def) => def })
  }
};

const Module = require('module');
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === 'vscode') return vscode;
  return originalLoad.apply(this, arguments);
};

const formatterModule = require('../out/formattingProvider.js');
const { ThriftFormattingProvider } = formatterModule;

(async function run() {
  const provider = new ThriftFormattingProvider();
  const examplePath = path.join(__dirname, '..', 'test-files', 'example.thrift');
  const uri = { fsPath: examplePath };
  const doc = {
    uri,
    getText: () => fs.readFileSync(examplePath, 'utf8'),
    lineAt: (line) => ({ text: fs.readFileSync(examplePath, 'utf8').split('\n')[line] || '' })
  };
  const fullRange = new vscode.Range(new vscode.Position(0,0), new vscode.Position(9999, 0));
  const edits = await provider.provideDocumentRangeFormattingEdits(doc, fullRange, { tabSize: 2, insertSpaces: true }, {});
  console.log('Debug indent edits count:', Array.isArray(edits) ? edits.length : 'not array');
})();
