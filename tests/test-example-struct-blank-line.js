// Mock vscode module to run formatter without VS Code
const Module = require('module');
const originalRequire = Module.prototype.require;

const vscode = {
  workspace: {
    getConfiguration: (section) => {
      if (section === 'thrift.format') {
        // Provide defaults with our overrides for this test
        const defaults = {
          trailingComma: 'preserve',
          alignTypes: true,
          alignFieldNames: true,

          alignAnnotations: true,
          alignComments: true,
          alignEnumNames: true,
          alignEnumEquals: true,
          alignEnumValues: true,
          indentSize: 2,
          maxLineLength: 100,
          collectionStyle: 'preserve',
        };
        return { get: (key) => defaults[key] };
      } else if (section === 'thrift-support.formatting') {
        // legacy namespace used by some tests; return defaults when requested
        return { get: (key, def) => def };
      }
      return { get: () => undefined };
    },
  },
  TextEdit: {
    replace: (range, newText) => ({ range, newText }),
  },
  Range: function (startLine, startChar, endLine, endChar) {
    return { start: { line: startLine, character: startChar }, end: { line: endLine, character: endChar } };
  },
};

Module.prototype.require = function (id) {
  if (id === 'vscode') return vscode;
  return originalRequire.apply(this, arguments);
};

const { ThriftFormattingProvider } = require('../out/formattingProvider.js');
Module.prototype.require = originalRequire;

function runTest() {
  const formatter = new ThriftFormattingProvider();

  // Read the actual example.thrift file
  const fs = require('fs');
  const path = require('path');
  const examplePath = path.join(__dirname, '..', 'test-files', 'example.thrift');
  const fullInput = fs.readFileSync(examplePath, 'utf8');
  
  // Extract the User struct section (lines 25-38 approximately)
  const lines = fullInput.split('\n');
  let startIdx = -1, endIdx = -1;
  
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('struct User {')) {
      startIdx = i;
    }
    if (startIdx >= 0 && lines[i].trim() === '}' && lines[i-1].includes('avatar')) {
      endIdx = i;
      break;
    }
  }
  
  if (startIdx === -1 || endIdx === -1) {
    console.error('Could not find User struct in example.thrift');
    process.exit(1);
  }
  
  const input = lines.slice(startIdx, endIdx + 1).join('\n');
  
  console.log('Testing User struct blank line preservation...');
  console.log('Input User struct:');
  console.log(input);
  console.log('---');

  const mockDoc = {
    getText: () => input,
  };
  const fullRange = { start: { line: 0, character: 0 }, end: { line: 9999, character: 0 } };
  const options = { insertSpaces: true, tabSize: 2 };

  const edits = formatter.provideDocumentRangeFormattingEdits(mockDoc, fullRange, options);
  if (!edits || edits.length === 0) {
    console.error('No edits returned');
    process.exit(1);
  }
  const output = edits[0].newText;

  console.log('Formatted output:');
  console.log(output);
  console.log('---');

  // Normalize line endings to avoid CRLF/LF mismatches on Windows
  const normalize = (s) => s
    .replace(/\r\n/g, '\n')
    // remove trailing spaces before line breaks (including on blank lines)
    .replace(/[ \t]+(?=\n)/g, '');
  
  const inputN = normalize(input);
  const outputN = normalize(output);

  // Check blank line preservation
  const inputBlankLines = (inputN.match(/^\s*$/gm) || []).length;
  const outputBlankLines = (outputN.match(/^\s*$/gm) || []).length;
  
  console.log(`Input blank lines: ${inputBlankLines}`);
  console.log(`Output blank lines: ${outputBlankLines}`);
  
  if (inputBlankLines !== outputBlankLines) {
    console.error(`❌ Blank line count changed: input=${inputBlankLines}, output=${outputBlankLines}`);
    process.exit(1);
  }
  
  // Check if blank lines are in the same positions
  const inputLines = inputN.split('\n');
  const outputLines = outputN.split('\n');
  
  let inputBlankPositions = [];
  let outputBlankPositions = [];
  
  for (let i = 0; i < inputLines.length; i++) {
    if (inputLines[i].trim() === '') {
      inputBlankPositions.push(i);
    }
  }
  
  for (let i = 0; i < outputLines.length; i++) {
    if (outputLines[i].trim() === '') {
      outputBlankPositions.push(i);
    }
  }
  
  console.log(`Input blank line positions: [${inputBlankPositions.join(', ')}]`);
  console.log(`Output blank line positions: [${outputBlankPositions.join(', ')}]`);
  
  // Check if positions match (allowing for some flexibility due to formatting changes)
  if (JSON.stringify(inputBlankPositions) !== JSON.stringify(outputBlankPositions)) {
    console.error('❌ Blank line positions changed after formatting');
    console.log('This indicates the blank line preservation issue exists');
    process.exit(1);
  }

  console.log('✅ User struct blank line preservation test PASSED');
}

runTest();
