// Simulate VS Code formatting scenarios more closely
const Module = require('module');
const originalRequire = Module.prototype.require;

// More complete vscode mock that matches actual VS Code behavior
const vscode = {
  workspace: {
    getConfiguration: (section) => {
      // Simulate different configuration scenarios
      if (section === 'thrift.format') {
        return {
          get: (key) => {
            const config = {
              trailingComma: 'preserve',
              alignTypes: true,
              alignFieldNames: true,
              alignStructEquals: true,
              alignAnnotations: true,
              alignComments: true,
              alignEnumNames: true,
              alignEnumEquals: true,
              alignEnumValues: true,
              indentSize: 2,
              maxLineLength: 100,
              collectionStyle: 'preserve',
            };
            return config[key];
          }
        };
      } else if (section === 'thrift-support.formatting') {
        return { get: (key, def) => def };
      } else if (section === 'editor') {
        return {
          get: (key) => {
            if (key === 'insertSpaces') return true;
            if (key === 'tabSize') return 2;
            return undefined;
          }
        };
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
  Position: function (line, character) {
    return { line, character };
  },
};

Module.prototype.require = function (id) {
  if (id === 'vscode') return vscode;
  return originalRequire.apply(this, arguments);
};

const { ThriftFormattingProvider } = require('../out/formatter');
Module.prototype.require = originalRequire;

function createMockDocument(content) {
  const lines = content.split('\n');
  return {
    getText: (range) => {
      if (!range) return content;
      const startLine = range.start.line;
      const endLine = range.end.line;
      const startChar = range.start.character || 0;
      const endChar = range.end.character || lines[endLine]?.length || 0;
      
      if (startLine === endLine) {
        return lines[startLine]?.substring(startChar, endChar) || '';
      }
      
      const result = [];
      for (let i = startLine; i <= endLine; i++) {
        if (i === startLine) {
          result.push(lines[i]?.substring(startChar) || '');
        } else if (i === endLine) {
          result.push(lines[i]?.substring(0, endChar) || '');
        } else {
          result.push(lines[i] || '');
        }
      }
      return result.join('\n');
    },
    positionAt: (offset) => {
      let currentOffset = 0;
      for (let i = 0; i < lines.length; i++) {
        const lineLength = lines[i].length + 1; // +1 for newline
        if (currentOffset + lineLength > offset) {
          return new vscode.Position(i, offset - currentOffset);
        }
        currentOffset += lineLength;
      }
      return new vscode.Position(lines.length - 1, lines[lines.length - 1]?.length || 0);
    },
    lineCount: lines.length,
    lineAt: (line) => ({
      text: lines[line] || '',
      range: new vscode.Range(line, 0, line, lines[line]?.length || 0),
    }),
  };
}

function runTest() {
  console.log('🔍 Testing VS Code formatting scenarios...\n');
  
  const formatter = new ThriftFormattingProvider();
  const fs = require('fs');
  const path = require('path');
  const examplePath = path.join(__dirname, '..', 'test-files', 'example.thrift');
  const originalContent = fs.readFileSync(examplePath, 'utf8');
  
  // Test 1: Format entire document (like Ctrl+Shift+I or format on save)
  console.log('📄 Test 1: Format entire document');
  console.log('=' .repeat(50));
  
  const mockDoc1 = createMockDocument(originalContent);
  const options = { insertSpaces: true, tabSize: 2 };
  
  const edits1 = formatter.provideDocumentFormattingEdits(mockDoc1, options);
  if (!edits1 || edits1.length === 0) {
    console.error('❌ No edits returned for document formatting');
    process.exit(1);
  }
  
  const formattedContent = edits1[0].newText;
  
  // Extract User struct from both versions
  const originalLines = originalContent.split('\n');
  const formattedLines = formattedContent.split('\n');
  
  // Find User struct in original
  let origUserStart = -1, origUserEnd = -1;
  for (let i = 0; i < originalLines.length; i++) {
    if (originalLines[i].includes('struct User {')) {
      origUserStart = i;
    }
    if (origUserStart >= 0 && originalLines[i].trim() === '}' && originalLines[i-1].includes('avatar')) {
      origUserEnd = i;
      break;
    }
  }
  
  // Find User struct in formatted
  let formUserStart = -1, formUserEnd = -1;
  for (let i = 0; i < formattedLines.length; i++) {
    if (formattedLines[i].includes('struct User {')) {
      formUserStart = i;
    }
    if (formUserStart >= 0 && formattedLines[i].trim() === '}') {
      // Check if this is the User struct closing brace by looking at previous lines
      let foundAvatar = false;
      for (let j = Math.max(0, i - 5); j < i; j++) {
        if (formattedLines[j].includes('avatar')) {
          foundAvatar = true;
          break;
        }
      }
      if (foundAvatar) {
        formUserEnd = i;
        break;
      }
    }
  }
  
  console.log(`Original User struct: lines ${origUserStart + 1}-${origUserEnd + 1}`);
  console.log(`Formatted User struct: lines ${formUserStart + 1}-${formUserEnd + 1}`);
  
  // Compare blank lines in User struct
  const origUserLines = originalLines.slice(origUserStart, origUserEnd + 1);
  const formUserLines = formattedLines.slice(formUserStart, formUserEnd + 1);
  
  let origBlanks = [], formBlanks = [];
  origUserLines.forEach((line, i) => {
    if (line.trim() === '') origBlanks.push(i + 1);
  });
  formUserLines.forEach((line, i) => {
    if (line.trim() === '') formBlanks.push(i + 1);
  });
  
  console.log(`Original blank positions: [${origBlanks.join(', ')}]`);
  console.log(`Formatted blank positions: [${formBlanks.join(', ')}]`);
  
  if (JSON.stringify(origBlanks) !== JSON.stringify(formBlanks)) {
    console.error('❌ Document formatting changed blank line positions!');
    
    console.log('\nDetailed User struct comparison:');
    const maxLen = Math.max(origUserLines.length, formUserLines.length);
    for (let i = 0; i < maxLen; i++) {
      const orig = i < origUserLines.length ? origUserLines[i] : '(missing)';
      const form = i < formUserLines.length ? formUserLines[i] : '(missing)';
      const origBlank = orig.trim() === '';
      const formBlank = form.trim() === '';
      
      if (origBlank !== formBlank) {
        console.log(`  Line ${i + 1}: ${origBlank ? 'BLANK' : 'TEXT'} -> ${formBlank ? 'BLANK' : 'TEXT'} ❌`);
      } else if (origBlank) {
        console.log(`  Line ${i + 1}: BLANK -> BLANK ✅`);
      }
    }
    process.exit(1);
  }
  
  console.log('✅ Document formatting preserves blank lines\n');
  
  // Test 2: Format selected range (lines 25-38)
  console.log('📝 Test 2: Format selected range (lines 25-38)');
  console.log('=' .repeat(50));
  
  const mockDoc2 = createMockDocument(originalContent);
  const range = new vscode.Range(24, 0, 37, originalLines[37]?.length || 0); // 0-indexed
  
  const edits2 = formatter.provideDocumentRangeFormattingEdits(mockDoc2, range, options);
  if (!edits2 || edits2.length === 0) {
    console.error('❌ No edits returned for range formatting');
    process.exit(1);
  }
  
  const rangeFormattedText = edits2[0].newText;
  const rangeOriginalText = mockDoc2.getText(range);
  
  const rangeOrigLines = rangeOriginalText.split('\n');
  const rangeFormLines = rangeFormattedText.split('\n');
  
  let rangeOrigBlanks = [], rangeFormBlanks = [];
  rangeOrigLines.forEach((line, i) => {
    if (line.trim() === '') rangeOrigBlanks.push(i + 1);
  });
  rangeFormLines.forEach((line, i) => {
    if (line.trim() === '') rangeFormBlanks.push(i + 1);
  });
  
  console.log(`Range original blank positions: [${rangeOrigBlanks.join(', ')}]`);
  console.log(`Range formatted blank positions: [${rangeFormBlanks.join(', ')}]`);
  
  if (JSON.stringify(rangeOrigBlanks) !== JSON.stringify(rangeFormBlanks)) {
    console.error('❌ Range formatting changed blank line positions!');
    
    console.log('\nDetailed range comparison:');
    const maxRangeLen = Math.max(rangeOrigLines.length, rangeFormLines.length);
    for (let i = 0; i < maxRangeLen; i++) {
      const orig = i < rangeOrigLines.length ? rangeOrigLines[i] : '(missing)';
      const form = i < rangeFormLines.length ? rangeFormLines[i] : '(missing)';
      const origBlank = orig.trim() === '';
      const formBlank = form.trim() === '';
      
      if (origBlank !== formBlank) {
        console.log(`  Line ${25 + i}: ${origBlank ? 'BLANK' : 'TEXT'} -> ${formBlank ? 'BLANK' : 'TEXT'} ❌`);
      } else if (origBlank) {
        console.log(`  Line ${25 + i}: BLANK -> BLANK ✅`);
      }
    }
    process.exit(1);
  }
  
  console.log('✅ Range formatting preserves blank lines\n');
  
  console.log('🎉 All VS Code formatting scenarios passed!');
  console.log('The formatter correctly preserves blank line positions in both document and range formatting.');
}

runTest();