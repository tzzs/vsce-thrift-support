const fs = require('fs');
const path = require('path');

// Minimal vscode mock
const vscode = {
  TextEdit: { replace: (range, text) => ({ range, newText: text }) },
  Range: class { constructor(start, end) { this.start = start; this.end = end; } },
  Position: class { constructor(line, character) { this.line = line; this.character = character; } },
  workspace: {
    getConfiguration: (_section) => ({ 
      get: (_key, def) => {
        // Override defaults for annotation testing
        const defaults = {
          'alignAnnotations': true,
          'alignStructAnnotations': true,
          'alignNames': true,
          'alignFieldNames': true,
          'alignEnumNames': true,
          'alignAssignments': true,
          'alignStructDefaults': false,
          'alignEnumEquals': true,
          'alignEnumValues': true,
          'alignTypes': true,
          'alignComments': true,
          'trailingComma': 'preserve',
          'indentSize': 4,
          'maxLineLength': 100,
          'collectionStyle': 'preserve'
        };
        return defaults[_key] !== undefined ? defaults[_key] : def;
      }
    })
  }
};

// Hook require('vscode')
const Module = require('module');
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === 'vscode') return vscode;
  return originalLoad.apply(this, arguments);
};

const { ThriftFormattingProvider } = require('./out/formattingProvider.js');

function resetRequireCache(moduleName) {
  Object.keys(require.cache).forEach((key) => {
    if (key.includes(moduleName)) delete require.cache[key];
  });
}

async function run() {
  resetRequireCache('out/formattingProvider.js');

  const provider = new ThriftFormattingProvider();

  const filePath = path.join(__dirname, 'test-files', 'annotation-edge-cases.thrift');
  const text = fs.readFileSync(filePath, 'utf8');
  const doc = {
    uri: { fsPath: filePath },
    getText: () => text,
    lineAt: (line) => ({ text: text.split('\n')[line] || '' }),
    positionAt: (offset) => {
      const lines = text.substring(0, offset).split('\n');
      return new vscode.Position(lines.length - 1, lines[lines.length - 1].length);
    }
  };

  const fullRange = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(9999, 0));
  const edits = await provider.provideDocumentRangeFormattingEdits(doc, fullRange, { tabSize: 4, insertSpaces: true }, {});

  if (!Array.isArray(edits)) {
    console.error('Formatting edits not returned as array');
    process.exit(1);
  }

  if (edits.length > 0) {
    const formattedText = edits[0].newText;
    
    console.log('=== ORIGINAL ===');
    console.log(text);
    console.log('\n=== FORMATTED ===');
    console.log(formattedText);
    
    // Write to files for comparison
    fs.writeFileSync('test-files/original.thrift', text);
    fs.writeFileSync('test-files/formatted.thrift', formattedText);
    
    console.log('\nFiles written to test-files/original.thrift and test-files/formatted.thrift');
  }

  console.log('annotation-test OK, edits:', edits.length);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});