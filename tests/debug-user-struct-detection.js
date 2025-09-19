// Debug script to check formatted content and User struct detection
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

const { ThriftFormattingProvider } = require('../out/formatter');
Module.prototype.require = originalRequire;

function runDebug() {
  const formatter = new ThriftFormattingProvider();
  const fs = require('fs');
  const path = require('path');
  const examplePath = path.join(__dirname, '..', 'test-files', 'example.thrift');
  const originalContent = fs.readFileSync(examplePath, 'utf8');
  
  console.log('🔍 Debugging User struct detection...\n');
  
  const mockDoc = {
    getText: () => originalContent,
    positionAt: (offset) => {
      const lines = originalContent.substring(0, offset).split('\n');
      return { line: lines.length - 1, character: lines[lines.length - 1].length };
    },
  };
  
  const options = { insertSpaces: true, tabSize: 2 };
  const edits = formatter.provideDocumentFormattingEdits(mockDoc, options);
  
  if (!edits || edits.length === 0) {
    console.error('❌ No edits returned');
    process.exit(1);
  }
  
  const formattedContent = edits[0].newText;
  
  console.log('📄 Original content around User struct:');
  const originalLines = originalContent.split('\n');
  for (let i = 20; i < 45; i++) {
    if (i < originalLines.length) {
      console.log(`Line ${i + 1}: "${originalLines[i]}"`);
    }
  }
  
  console.log('\n📄 Formatted content (first 50 lines):');
  const formattedLines = formattedContent.split('\n');
  for (let i = 0; i < Math.min(50, formattedLines.length); i++) {
    console.log(`Line ${i + 1}: "${formattedLines[i]}"`);
  }
  
  console.log('\n🔍 Searching for "struct User" in formatted content:');
  for (let i = 0; i < formattedLines.length; i++) {
    if (formattedLines[i].includes('struct User')) {
      console.log(`Found at line ${i + 1}: "${formattedLines[i]}"`);
      
      // Show surrounding lines
      console.log('\nSurrounding lines:');
      for (let j = Math.max(0, i - 3); j <= Math.min(formattedLines.length - 1, i + 15); j++) {
        const marker = j === i ? ' >>> ' : '     ';
        console.log(`${marker}Line ${j + 1}: "${formattedLines[j]}" ${formattedLines[j].trim() === '' ? '(BLANK)' : ''}`);
      }
      break;
    }
  }
  
  console.log('\n🔍 Searching for "avatar" in formatted content:');
  for (let i = 0; i < formattedLines.length; i++) {
    if (formattedLines[i].includes('avatar')) {
      console.log(`Found at line ${i + 1}: "${formattedLines[i]}"`);
    }
  }
  
  // Write formatted content to file for inspection
  const debugPath = path.join(__dirname, '..', 'test-files', 'debug-formatted.thrift');
  fs.writeFileSync(debugPath, formattedContent, 'utf8');
  console.log(`\n📝 Formatted content written to: ${debugPath}`);
}

runDebug();