// Mock vscode module to run formatter without VS Code
const Module = require('module');
const originalRequire = Module.prototype.require;

const vscode = {
  workspace: {
    getConfiguration: (section) => {
      if (section === 'thrift.format') {
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

  // Read the full example.thrift file
  const fs = require('fs');
  const path = require('path');
  const examplePath = path.join(__dirname, '..', 'test-files', 'example.thrift');
  const fullInput = fs.readFileSync(examplePath, 'utf8');
  
  console.log('Testing full file formatting...');
  
  // Find User struct in original file
  const inputLines = fullInput.split('\n');
  let userStructStart = -1, userStructEnd = -1;
  
  for (let i = 0; i < inputLines.length; i++) {
    if (inputLines[i].includes('struct User {')) {
      userStructStart = i;
    }
    if (userStructStart >= 0 && inputLines[i].trim() === '}' && inputLines[i-1].includes('avatar')) {
      userStructEnd = i;
      break;
    }
  }
  
  console.log(`User struct found at lines ${userStructStart + 1}-${userStructEnd + 1}`);
  
  // Show original User struct
  console.log('\nOriginal User struct:');
  for (let i = userStructStart; i <= userStructEnd; i++) {
    const line = inputLines[i];
    console.log(`Line ${i + 1}: "${line}" ${line.trim() === '' ? '(BLANK)' : ''}`);
  }

  const mockDoc = {
    getText: () => fullInput,
    positionAt: (offset) => {
      const lines = fullInput.substring(0, offset).split('\n');
      return { line: lines.length - 1, character: lines[lines.length - 1].length };
    },
  };
  const fullRange = { start: { line: 0, character: 0 }, end: { line: 9999, character: 0 } };
  const options = { insertSpaces: true, tabSize: 2 };

  const edits = formatter.provideDocumentFormattingEdits(mockDoc, options);
  if (!edits || edits.length === 0) {
    console.error('No edits returned');
    process.exit(1);
  }
  const output = edits[0].newText;

  // Find User struct in formatted output
  const outputLines = output.split('\n');
  let outputUserStructStart = -1, outputUserStructEnd = -1;
  
  for (let i = 0; i < outputLines.length; i++) {
    if (outputLines[i].includes('struct User {')) {
      outputUserStructStart = i;
    }
    if (outputUserStructStart >= 0 && outputLines[i].trim() === '}' && outputLines[i-1].includes('avatar')) {
      outputUserStructEnd = i;
      break;
    }
  }
  
  console.log(`\nFormatted User struct found at lines ${outputUserStructStart + 1}-${outputUserStructEnd + 1}`);
  
  // Show formatted User struct
  console.log('\nFormatted User struct:');
  for (let i = outputUserStructStart; i <= outputUserStructEnd; i++) {
    const line = outputLines[i];
    console.log(`Line ${i + 1}: "${line}" ${line.trim() === '' ? '(BLANK)' : ''}`);
  }

  // Compare blank line positions within User struct
  const originalUserLines = inputLines.slice(userStructStart, userStructEnd + 1);
  const formattedUserLines = outputLines.slice(outputUserStructStart, outputUserStructEnd + 1);
  
  let originalBlankPositions = [];
  let formattedBlankPositions = [];
  
  for (let i = 0; i < originalUserLines.length; i++) {
    if (originalUserLines[i].trim() === '') {
      originalBlankPositions.push(i + 1); // 1-based
    }
  }
  
  for (let i = 0; i < formattedUserLines.length; i++) {
    if (formattedUserLines[i].trim() === '') {
      formattedBlankPositions.push(i + 1); // 1-based
    }
  }
  
  console.log(`\nOriginal User struct blank line positions: [${originalBlankPositions.join(', ')}]`);
  console.log(`Formatted User struct blank line positions: [${formattedBlankPositions.join(', ')}]`);
  
  if (JSON.stringify(originalBlankPositions) !== JSON.stringify(formattedBlankPositions)) {
    console.error('❌ Blank line positions changed in User struct after full file formatting');
    
    // Show detailed comparison
    console.log('\nDetailed User struct comparison:');
    const maxLines = Math.max(originalUserLines.length, formattedUserLines.length);
    for (let i = 0; i < maxLines; i++) {
      const origLine = i < originalUserLines.length ? originalUserLines[i] : '(missing)';
      const formLine = i < formattedUserLines.length ? formattedUserLines[i] : '(missing)';
      const origBlank = origLine.trim() === '';
      const formBlank = formLine.trim() === '';
      
      if (origBlank !== formBlank) {
        console.log(`Struct Line ${i + 1}: ORIGINAL ${origBlank ? 'BLANK' : 'NON-BLANK'} -> FORMATTED ${formBlank ? 'BLANK' : 'NON-BLANK'} ❌`);
      } else if (origBlank && formBlank) {
        console.log(`Struct Line ${i + 1}: Both BLANK ✅`);
      }
    }
    
    process.exit(1);
  }

  console.log('✅ Full file formatting preserves User struct blank lines correctly');
  
  // Write formatted output to a temp file for manual inspection
  const outputPath = path.join(__dirname, '..', 'test-files', 'example-formatted.thrift');
  fs.writeFileSync(outputPath, output, 'utf8');
  console.log(`\nFormatted output written to: ${outputPath}`);
}

runTest();
