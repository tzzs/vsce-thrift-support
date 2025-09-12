const fs = require('fs');
const path = require('path');

// 模拟VSCode环境
const mockVscode = {
    TextEdit: class {
        constructor(range, newText) {
            this.range = range;
            this.newText = newText;
        }
        
        static replace(range, newText) {
            return new mockVscode.TextEdit(range, newText);
        }
    },
    Range: class {
        constructor(startLine, startChar, endLine, endChar) {
            this.start = { line: startLine, character: startChar };
            this.end = { line: endLine, character: endChar };
        }
    },
    workspace: {
        getConfiguration: function(section) {
            return {
                get: function(key, defaultValue) {
                    // 返回默认的格式化配置
                    const config = {
                        'thrift.formatting.alignTypes': true,
                        'thrift.formatting.alignFieldNames': true,
                        'thrift.formatting.alignComments': true,
                        'thrift.formatting.trailingComma': true,
                        'thrift.formatting.indentSize': 2
                    };
                    const fullKey = section ? `${section}.${key}` : key;
                    return config[fullKey] !== undefined ? config[fullKey] : defaultValue;
                }
            };
        }
    }
};

// 使用Module._cache来模拟vscode模块
const Module = require('module');
const originalRequire = Module.prototype.require;

Module.prototype.require = function(id) {
    if (id === 'vscode') {
        return mockVscode;
    }
    return originalRequire.apply(this, arguments);
};

// 导入编译后的格式化器
const { ThriftFormattingProvider } = require('./out/formatter');

// 恢复原始require
Module.prototype.require = originalRequire;

// 创建格式化器实例
const formatter = new ThriftFormattingProvider();

// 模拟文档
class MockDocument {
    constructor(text) {
        this.lines = text.split('\n');
        this.lineCount = this.lines.length;
    }
    
    getText(range) {
        if (!range) {
            return this.lines.join('\n');
        }
        
        if (range.start.line === range.end.line) {
            return this.lines[range.start.line].substring(range.start.character, range.end.character);
        }
        
        let result = [];
        for (let i = range.start.line; i <= range.end.line; i++) {
            if (i === range.start.line) {
                result.push(this.lines[i].substring(range.start.character));
            } else if (i === range.end.line) {
                result.push(this.lines[i].substring(0, range.end.character));
            } else {
                result.push(this.lines[i]);
            }
        }
        return result.join('\n');
    }
    
    lineAt(line) {
        return {
            text: this.lines[line] || '',
            range: new mockVscode.Range(line, 0, line, (this.lines[line] || '').length)
        };
    }
    
    positionAt(offset) {
        let currentOffset = 0;
        for (let line = 0; line < this.lines.length; line++) {
            const lineLength = this.lines[line].length + 1; // +1 for newline
            if (currentOffset + lineLength > offset) {
                return { line: line, character: offset - currentOffset };
            }
            currentOffset += lineLength;
        }
        return { line: this.lines.length - 1, character: this.lines[this.lines.length - 1].length };
    }
    
    offsetAt(position) {
        let offset = 0;
        for (let line = 0; line < position.line; line++) {
            offset += this.lines[line].length + 1; // +1 for newline
        }
        return offset + position.character;
    }
}

// 读取example.thrift文件
const examplePath = path.join(__dirname, 'example.thrift');
const exampleContent = fs.readFileSync(examplePath, 'utf8');

console.log('=== 原始文件内容 ===');
console.log(exampleContent);
console.log('\n=== 开始格式化测试 ===');

// 创建模拟文档
const document = new MockDocument(exampleContent);

// 模拟格式化选项
const options = {
    tabSize: 2,
    insertSpaces: true
};

// 创建全文档范围
const fullRange = new mockVscode.Range(0, 0, document.lineCount - 1, document.lines[document.lineCount - 1].length);

try {
    // 调用格式化方法
    const edits = formatter.provideDocumentFormattingEdits(document, options, null);
    
    console.log(`格式化返回了 ${edits.length} 个编辑操作`);
    
    if (edits.length > 0) {
        console.log('\n=== 格式化编辑操作 ===');
        edits.forEach((edit, index) => {
            console.log(`编辑 ${index + 1}:`);
            console.log(`  范围: 行${edit.range.start.line}-${edit.range.end.line}, 字符${edit.range.start.character}-${edit.range.end.character}`);
            console.log(`  原文本: "${document.getText(edit.range)}"`);
            console.log(`  新文本: "${edit.newText}"`);
            console.log('');
        });
        
        // 应用编辑操作模拟最终结果
        let result = exampleContent;
        // 从后往前应用编辑，避免位置偏移问题
        for (let i = edits.length - 1; i >= 0; i--) {
            const edit = edits[i];
            const lines = result.split('\n');
            const startLine = edit.range.start.line;
            const endLine = edit.range.end.line;
            const startChar = edit.range.start.character;
            const endChar = edit.range.end.character;
            
            if (startLine === endLine) {
                lines[startLine] = lines[startLine].substring(0, startChar) + edit.newText + lines[startLine].substring(endChar);
            } else {
                const newLines = edit.newText.split('\n');
                const before = lines[startLine].substring(0, startChar);
                const after = lines[endLine].substring(endChar);
                
                // 替换多行
                const replacement = [before + newLines[0]];
                for (let j = 1; j < newLines.length - 1; j++) {
                    replacement.push(newLines[j]);
                }
                if (newLines.length > 1) {
                    replacement.push(newLines[newLines.length - 1] + after);
                } else {
                    replacement[0] += after;
                }
                
                lines.splice(startLine, endLine - startLine + 1, ...replacement);
            }
            result = lines.join('\n');
        }
        
        console.log('\n=== 格式化后的结果 ===');
        console.log(result);
        
        // 检查是否有变化
        if (result !== exampleContent) {
            console.log('\n✅ 格式化成功，内容已改变');
        } else {
            console.log('\n❌ 格式化没有改变内容');
        }
    } else {
        console.log('\n❌ 没有返回任何格式化编辑操作');
    }
    
} catch (error) {
    console.error('格式化过程中出错:', error);
    console.error('错误堆栈:', error.stack);
}