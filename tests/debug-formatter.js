const fs = require('fs');
const path = require('path');

// 模拟VSCode模块
const vscode = {
    TextDocument: class {
        constructor(text) {
            this._text = text;
        }
        getText(range) {
            return this._text;
        }
        positionAt(offset) {
            return { line: 0, character: offset };
        }
        getLineCount() {
            return this._text.split('\n').length;
        }
        lineAt(position) {
            return {
                text: this._text.split('\n')[position.line || 0],
                range: { start: { line: 0, character: 0 }, end: { line: 0, character: 100 } }
            };
        }
    },
    TextEdit: class {
        constructor(range, newText) {
            this.range = range;
            this.newText = newText;
        }
        static replace(range, newText) {
            return new vscode.TextEdit(range, newText);
        }
    },
    Range: class {
        constructor(start, end) {
            this.start = start;
            this.end = end;
        }
    },
    CancellationToken: class {
        isCancellationRequested = false;
        onCancellationRequested = { dispose: () => {} };
    },
    DocumentFormattingEditProvider: class {},
    DocumentRangeFormattingEditProvider: class {}
};

// 将模拟的vscode模块注入到全局
Object.defineProperty(global, 'vscode', {
    value: vscode,
    writable: true
});

// 模拟VSCode的格式化选项
const mockOptions = {
    insertSpaces: true,
    tabSize: 2,
    indentSize: 2,
    alignTypes: true,
    alignFieldNames: true,
    alignComments: true,
    trailingComma: true
};

// 读取编译后的格式化器
const FormatterModule = require('../out/formattingProvider.js');
const ThriftFormattingProvider = FormatterModule.ThriftFormattingProvider;

// 创建格式化器实例
const formatter = new ThriftFormattingProvider();

// 测试常量内部元素缩进
const testCode = `
const map<string, map<string, i32>> TEST_ERROR_CODES = {
  "users": {
    "not_found": 404,
    "unauthorized": 401
  },
  "products": {
    "out_of_stock": 503,
    "invalid_data": 400
  }
};
`;

// 使用模拟的TextDocument测试格式化
function testFormatting(code) {
    const document = new vscode.TextDocument(code);
    const fullRange = new vscode.Range(
        document.positionAt(0),
        document.positionAt(code.length)
    );
    const edits = formatter.formatRange(document, fullRange, mockOptions);
    
    // 应用编辑
    let formattedCode = code;
    // 按照从后向前的顺序应用编辑，避免位置偏移问题
    edits.sort((a, b) => {
        return b.range.start.line - a.range.start.line || 
               b.range.start.character - a.range.start.character;
    }).forEach(edit => {
        // 简化的编辑应用逻辑
        const lines = formattedCode.split('\n');
        if (edit.range.start.line === edit.range.end.line) {
            // 单行编辑
            const line = lines[edit.range.start.line];
            lines[edit.range.start.line] = 
                line.substring(0, edit.range.start.character) + 
                edit.newText + 
                line.substring(edit.range.end.character);
        } else {
            // 多行编辑
            const newLines = edit.newText.split('\n');
            const beforeLines = lines.slice(0, edit.range.start.line);
            const afterLines = lines.slice(edit.range.end.line + 1);
            lines.splice(0, lines.length, ...beforeLines, ...newLines, ...afterLines);
        }
        formattedCode = lines.join('\n');
    });
    
    return formattedCode;
}

// 执行格式化测试
const formattedCode = testFormatting(testCode);

console.log("格式化前:");
console.log(testCode);
console.log("\n格式化后:");
console.log(formattedCode);

// 测试各个方法
console.log('\n=== 测试各个方法 ===');

// 测试isStructStart
const structLine = 'struct User {';
console.log(`isStructStart('${structLine}'):`, formatter.isStructStart(structLine));

// 测试isStructField
const fieldLines = [
    '  1: required UserId     id,',
    '  2: required string name,',
    '  3: optional Email email,'
];

fieldLines.forEach(line => {
    console.log(`isStructField('${line}'):`, formatter.isStructField(line));
});

// 测试parseStructField
fieldLines.forEach(line => {
    const result = formatter.parseStructField(line);
    console.log(`parseStructField('${line}'):`, result);
});
