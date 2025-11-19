const fs = require('fs');
const path = require('path');

// Minimal vscode mock
const vscode = {
  TextEdit: { replace: (range, text) => ({ range, newText: text }) },
  Range: class { constructor(start, end) { this.start = start; this.end = end; } },
  Position: class { constructor(line, character) { this.line = line; this.character = character; } },
  workspace: {
    getConfiguration: (_section) => ({ get: (_key, def) => def })
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

// 测试example.thrift文件的格式化
function testExampleThrift() {
  console.log('=== 测试example.thrift文件的const格式化 ===');
  
  const examplePath = path.join(__dirname, 'test-files', 'example.thrift');
  const content = fs.readFileSync(examplePath, 'utf8');
  
  const provider = new ThriftFormattingProvider();
  const options = {
    indentSize: 2,
    insertSpaces: true,
    alignComments: true
  };
  
  // Find the ERROR_CODES const declaration
  const originalLines = content.split('\n');
  for (let i = 0; i < originalLines.length; i++) {
    if (originalLines[i].includes('ERROR_CODES')) {
      console.log(`原始文件的第${i+1}行:`);
      console.log(originalLines[i]);
      console.log('该行是否匹配isConstStart:', provider.isConstStart(originalLines[i]));
      console.log('该行是否匹配isConstField:', provider.isConstField(originalLines[i]));
      console.log();
      break;
    }
  }
  
  const formattedContent = provider.formatThriftCode(content, options);
  
  // Find the ERROR_CODES in the formatted content
  const formattedLines = formattedContent.split('\n');
  for (let i = 0; i < formattedLines.length; i++) {
    if (formattedLines[i].includes('ERROR_CODES')) {
      console.log('格式化后的const声明部分:');
      console.log(formattedLines[i]);
      console.log('该行是否以空格开头:', formattedLines[i].match(/^\s/));
      console.log();
      
      // Show more context around the ERROR_CODES in formatted content
      console.log('格式化内容中ERROR_CODES的上下文:');
      const start = Math.max(0, i-2);
      const end = Math.min(formattedLines.length, i+5);
      for (let j = start; j < end; j++) {
        console.log(`第${j+1}行: ${formattedLines[j]}`);
      }
      break;
    }
  }
}

testExampleThrift();