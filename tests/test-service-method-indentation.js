// 服务方法参数缩进测试
const path = require('path');
const fs = require('fs');

// Mock minimal VS Code API used by the formatter
const vscode = {
  window: {
    showInformationMessage: (...args) => console.log('[Info]', ...args),
    showErrorMessage: (...args) => console.error('[Error]', ...args),
  },
  Position: class {
    constructor(line, character) {
      this.line = line;
      this.character = character;
    }
  },
  Range: class {
    constructor(start, end) {
      this.start = start;
      this.end = end;
    }
  },
  TextEdit: class {
    static replace(range, newText) {
      return { range, newText };
    }
  },
  Uri: {
    file: (fsPath) => ({ fsPath, toString: () => `file://${fsPath}` })
  },
  workspace: {
    openTextDocument: async (uri) => {
      const text = fs.readFileSync(uri.fsPath, 'utf8');
      const lines = text.split('\n');
      return {
        uri,
        getText: () => text,
        lineAt: (line) => ({ text: lines[line] || '' })
      };
    },
    getConfiguration: (_section) => ({
      get: (_key, def) => def,
    }),
  }
};

// Mock require('vscode') inside formatter
const Module = require('module');
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'vscode') {
    return vscode;
  }
  return originalLoad.apply(this, arguments);
};

// Import the formatter provider (compiled output)
const { ThriftFormattingProvider } = require('../out/formattingProvider.js');

// 测试用的服务定义代码
const testServiceCode = `service TestService {
    // ping
    PingResponse Ping(
    1: required trace.Trace traceInfo,
    2: required PingRequest request
    )
}`;

// 期望的结果 (Apache Thrift官方标准：方法2空格，参数2空格同级)
const expectedServiceCode = `service TestService {
  // ping
  PingResponse Ping(
    1: required trace.Trace traceInfo,
    2: required PingRequest request
  )
}`;

async function testServiceMethodFormatting() {
  console.log('=== 服务方法参数缩进测试 ===\n');
  
  const provider = new ThriftFormattingProvider();
  
  // 创建临时测试文件
  const tempFilePath = path.join(__dirname, 'temp-service-test.thrift');
  fs.writeFileSync(tempFilePath, testServiceCode);
  
  try {
    const testUri = vscode.Uri.file(tempFilePath);
    const doc = await vscode.workspace.openTextDocument(testUri);
    
    const fullRange = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(1000, 0));
    const edits = await provider.provideDocumentRangeFormattingEdits(doc, fullRange, { tabSize: 2, insertSpaces: true, indentSize: 2 }, {});
    
    if (!Array.isArray(edits)) {
      console.error('❌ 格式化提供者没有返回编辑数组');
      return false;
    }
    
    if (edits.length === 0) {
      console.log('❌ 没有检测到需要格式化的更改');
      return false;
    }
    
    // 应用编辑到原始文本
    let formattedText = doc.getText();
    for (const edit of edits) {
      const lines = formattedText.split('\n');
      const startLine = edit.range.start.line;
      const endLine = edit.range.end.line;
      
      lines.splice(startLine, endLine - startLine + 1, ...edit.newText.split('\n'));
      formattedText = lines.join('\n');
    }
    
    console.log('原始代码:');
    console.log(testServiceCode);
    console.log('\n格式化后代码:');
    console.log(formattedText);
    console.log('\n期望的代码:');
    console.log(expectedServiceCode);
    
    // 检查参数缩进是否正确
    const formattedLines = formattedText.split('\n');
    const paramLine1 = formattedLines.find(line => line.includes('1: required trace.Trace traceInfo'));
    const paramLine2 = formattedLines.find(line => line.includes('2: required PingRequest request'));
    
    if (!paramLine1 || !paramLine2) {
      console.log('❌ 找不到参数行');
      return false;
    }
    
    const paramIndent1 = paramLine1.match(/^(\s*)/)[1].length;
    const paramIndent2 = paramLine2.match(/^(\s*)/)[1].length;
    
    console.log(`\n参数1缩进: ${paramIndent1} 个空格`);
    console.log(`参数2缩进: ${paramIndent2} 个空格`);
    
    if (paramIndent1 === 4 && paramIndent2 === 4) {
      console.log('✅ 参数缩进正确 (4个空格，Apache Thrift官方标准)');
      return true;
    } else {
      console.log('❌ 参数缩进不正确，期望4个空格 (Apache Thrift官方标准)');
      return false;
    }
    
  } finally {
    // 清理临时文件
    if (fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }
  }
}

// 运行测试
(async function run() {
  try {
    const success = await testServiceMethodFormatting();
    process.exit(success ? 0 : 1);
  } catch (error) {
    console.error('测试执行失败:', error);
    process.exit(1);
  }
})();