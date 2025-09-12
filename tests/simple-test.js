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
                    return defaultValue;
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

// 测试用的Thrift代码
const testCode = `struct User {
  1: required UserId     id,
  2: required string   name,
  3: optional Email    email,
  4: optional i32      age,
  5: optional Status   status    = Status.ACTIVE,
  6: optional list<string> tags,
  7: optional map<string, string> metadata,
  8: optional bool     isVerified= false,
  9: optional double   score     = 0.0,
  10: optional binary   avatar,
}`;

console.log('=== 原始代码 ===');
console.log(testCode);
console.log('\n=== 开始格式化测试 ===');

try {
    // 直接调用formatThriftCode方法
    const options = {
        trailingComma: true,
        alignTypes: true,
        alignFieldNames: true,
        alignComments: true,
        indentSize: 2,
        maxLineLength: 100,
        insertSpaces: true,
        tabSize: 2
    };
    
    // 使用反射访问私有方法
    const formattedText = formatter.formatThriftCode(testCode, options);
    
    console.log('=== 格式化结果 ===');
    console.log(formattedText);
    
    if (formattedText !== testCode) {
        console.log('\n✅ 格式化成功，内容已改变');
    } else {
        console.log('\n❌ 格式化没有改变内容');
    }
    
} catch (error) {
    console.error('格式化过程中出错:', error);
    console.error('错误堆栈:', error.stack);
}