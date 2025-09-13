// Mock vscode module before any imports
const vscode = {
  TextEdit: {
    replace: (range, newText) => ({ range, newText })
  },
  Range: function(startLine, startChar, endLine, endChar) {
    return { start: { line: startLine, character: startChar }, end: { line: endLine, character: endChar } };
  },
  workspace: {
    // Will be overridden per test case
    getConfiguration: (_section) => ({
      get: (key) => {
        const defaults = {
          trailingComma: 'preserve',
          alignTypes: true,
          alignFieldNames: true,
          alignComments: true,
          alignEnumNames: true,
          alignEnumEquals: true,
          alignEnumValues: true,
          indentSize: 4,
          maxLineLength: 100,
          collectionStyle: 'preserve'
        };
        return key in defaults ? defaults[key] : undefined;
      }
    })
  }
};

// Mock the module system
const Module = require('module');
const originalRequire = Module.prototype.require;
Module.prototype.require = function(id) {
  if (id === 'vscode') {
    return vscode;
  }
  return originalRequire.apply(this, arguments);
};

// Import the formatter
const { ThriftFormattingProvider } = require('../out/formatter.js');

// Restore original require after import
Module.prototype.require = originalRequire;

function runWithConfig(input, configOverrides = {}) {
  const originalGetConfiguration = vscode.workspace.getConfiguration;
  vscode.workspace.getConfiguration = (section) => ({
    get: (key) => {
      // Our formatter calls getConfiguration('thrift.format').get(key)
      // Here we just resolve overrides/defaults by key
      if (Object.prototype.hasOwnProperty.call(configOverrides, key)) {
        return configOverrides[key];
      }
      const defaults = {
        trailingComma: 'preserve',
        alignTypes: true,
        alignFieldNames: true,
        alignComments: true,
        alignEnumNames: true,
        alignEnumEquals: true,
        alignEnumValues: true,
        indentSize: 4,
        maxLineLength: 100,
        collectionStyle: 'preserve'
      };
      return defaults[key];
    }
  });

  const formatter = new ThriftFormattingProvider();
  const mockDocument = {
    getText: () => input,
    lineCount: input.split('\n').length,
    lineAt: (i) => ({ text: input.split('\n')[i] })
  };
  const mockOptions = { insertSpaces: true, tabSize: 4 };
  const mockRange = new vscode.Range(0, 0, mockDocument.lineCount - 1, (input.split('\n').pop() || '').length);

  const edits = formatter.provideDocumentRangeFormattingEdits(mockDocument, mockRange, mockOptions);
  const output = edits && edits.length > 0 ? edits[0].newText : input;

  vscode.workspace.getConfiguration = originalGetConfiguration;
  return output;
}

function checkAlignedColumns(lines, extractor) {
  const cols = lines.map(extractor).filter((c) => c >= 0);
  if (cols.length <= 1) return true;
  return cols.every((c) => c === cols[0]);
}

// 1) const 行注释列对齐
(function testConstCommentAlignment() {
  console.log('\n=== Test 1: Const comment alignment ===');
  const input = `const i32 A = 1 // a\nconst string BBB = 'x' // bb\nconst i64 CC = 3 // ccc`;
  const output = runWithConfig(input, { alignComments: true });
  console.log(output);

  const outLines = output.split('\n');
  const constLines = outLines.filter((l) => l.trim().startsWith('const'));
  const commentCols = constLines.map((l) => l.indexOf('//'));
  const aligned = checkAlignedColumns(constLines, (l) => l.indexOf('//'));
  console.log('Comment columns:', commentCols);
  console.log(aligned ? '✓ Comments aligned' : '✗ Comments not aligned');
  if (!aligned) process.exitCode = 1;
})();

// 2) 多行集合项行尾注释列对齐（使用 map 花括号，避免括号匹配差异）
(function testMultilineCollectionItemCommentAlignment() {
  console.log('\n=== Test 2: Multiline collection item comment alignment ===');
  const input = `const map<string, i32> M = {\n  "a": 1, // first\n  "bb": 2, // second\n  "ccc": 3 // third\n}`;
  const output = runWithConfig(input, { alignComments: true });
  console.log(output);

  const lines = output.split('\n');
  // pick only item lines (indented, not closing brace)
  const itemLines = lines.filter((l) => /\s+\".*\"\s*:\s*\d+/.test(l));
  const aligned = checkAlignedColumns(itemLines, (l) => l.indexOf('//'));
  console.log('Item comment columns:', itemLines.map((l) => l.indexOf('//')));
  console.log(aligned ? '✓ Item comments aligned' : '✗ Item comments not aligned');
  if (!aligned) process.exitCode = 1;
})();

// 3) collectionStyle = preserve 时保持单行
(function testCollectionStylePreserve() {
  console.log('\n=== Test 3: collectionStyle = preserve keeps inline ===');
  const input = `const list<string> SUPPORTED_LANGUAGES = ["java", "python", "cpp"]`;
  const output = runWithConfig(input, { collectionStyle: 'preserve' });
  console.log(output);
  const isSingleLine = !/\n/.test(output);
  console.log(isSingleLine ? '✓ Preserved as single line' : '✗ Unexpectedly expanded');
  if (!isSingleLine) process.exitCode = 1;
})();

// 4) collectionStyle = multiline 时强制展开为多行
(function testCollectionStyleMultiline() {
  console.log('\n=== Test 4: collectionStyle = multiline expands inline ===');
  const input = `const list<string> SUPPORTED_LANGUAGES = ["java", "python", "cpp"]`;
  const output = runWithConfig(input, { collectionStyle: 'multiline' });
  console.log(output);

  const outLines = output.split('\n');
  const hasOpeningOnFirst = /const\s+.*=\s*\[\s*$/.test(outLines[0]);
  const hasItemsIndented = outLines.slice(1, -1).every((l) => /^\s+.+$/.test(l));
  const lastLineIsClosing = /^\s*\]\s*$/.test(outLines[outLines.length - 1]);

  const ok = hasOpeningOnFirst && hasItemsIndented && lastLineIsClosing;
  console.log(ok ? '✓ Expanded to multiline with proper structure' : '✗ Expansion structure incorrect');
  if (!ok) process.exitCode = 1;

  // 5) 多行 list 常量的缩进应为一层（回归测试，覆盖 example.thrift 103-108 场景）
  (function testMultilineListConstIndentation() {
    console.log('\n=== Test 5: Multiline list const indentation (regression) ===');
    const input = [
      'const list<string> SUPPORTED_LANGUAGES = [             // 支持的编程语言列表',
      '"java",',
      '"python",',
      '"cpp",',
      '"javascript"',
      ']' 
    ].join('\n');
  
    const output = runWithConfig(input, { /* 使用默认配置即可 */ });
    console.log(output);
  
    const lines = output.split('\n');
    // 期望结构：
    // 1) 第一行以 '= [' 结束
    // 2) 中间项至少缩进 1 层（4 空格），且每行都有内容
    // 3) 最后一行仅为 ']'，与 const 行对齐（即无前导空格，或与第一行相同缩进级别）
    const hasOpeningOnFirst = /const\s+.*=\s*\[\s*\/\//.test(lines[0]) || /const\s+.*=\s*\[\s*$/.test(lines[0]);
    const items = lines.slice(1, -1);
    const itemsIndented = items.every((l) => /^\s{2,}.+/.test(l)); // 至少有若干空格缩进
    const closingAlign = /^\s*\]\s*$/.test(lines[lines.length - 1]);
  
    const ok = hasOpeningOnFirst && items.length >= 1 && itemsIndented && closingAlign;
    console.log(ok ? '✓ Multiline list const is properly indented' : '✗ Multiline list const indentation incorrect');
    if (!ok) process.exitCode = 1;
  })();
  
  console.log('\nConst formatting tests completed.');
})();