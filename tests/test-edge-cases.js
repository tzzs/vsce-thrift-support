#!/usr/bin/env node

/**
 * 测试边界情况，确保修复后的格式化器能处理可能导致负缩进的情况
 */

const fs = require('fs');
const path = require('path');

console.log('🧪 测试边界情况...');
console.log('=' .repeat(50));

// 模拟vscode模块
const mockVscode = {
    workspace: {
        getConfiguration: () => ({
            get: (key) => {
                const defaults = {
                    'trailingComma': true,
                    'alignTypes': true,
                    'alignFieldNames': true,
                    'alignComments': true,
                    'indentSize': 2,
                    'maxLineLength': 100
                };
                return defaults[key];
            }
        })
    },
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
        constructor(start, end) {
            this.start = start;
            this.end = end;
        }
    },
    Position: class {
        constructor(line, character) {
            this.line = line;
            this.character = character;
        }
    }
};

// 拦截require调用
const Module = require('module');
const originalRequire = Module.prototype.require;
Module.prototype.require = function(id) {
    if (id === 'vscode') {
        return mockVscode;
    }
    return originalRequire.apply(this, arguments);
};

try {
    // 导入格式化器
    const { ThriftFormattingProvider } = require('./out/formatter.js');
    
    // 恢复原始require
    Module.prototype.require = originalRequire;
    
    // 创建格式化器实例
    const formatter = new ThriftFormattingProvider();
    
    // 测试用例1: 多余的闭合大括号
    console.log('\n测试用例1: 多余的闭合大括号');
    const testCase1 = `struct User {
  1: required string name,
}
}`; // 多了一个闭合大括号
    
    const formatThriftCode = formatter.formatThriftCode || formatter['formatThriftCode'];
    if (typeof formatThriftCode === 'function') {
        const config = {
            trailingComma: true,
            alignTypes: true,
            alignFieldNames: true,
            alignComments: true,
            indentSize: 2,
            maxLineLength: 100,
            insertSpaces: true
        };
        
        try {
            const result1 = formatThriftCode.call(formatter, testCase1, config);
            console.log('✅ 测试用例1通过 - 没有抛出错误');
            console.log('原始:', testCase1.replace(/\n/g, '\\n'));
            console.log('结果:', result1.replace(/\n/g, '\\n'));
        } catch (error) {
            console.log('❌ 测试用例1失败:', error.message);
        }
        
        // 测试用例2: 嵌套结构不匹配
        console.log('\n测试用例2: 嵌套结构不匹配');
        const testCase2 = `struct Outer {
  struct Inner {
    1: string value,
  }
}
}`; // 多了一个闭合大括号
        
        try {
            const result2 = formatThriftCode.call(formatter, testCase2, config);
            console.log('✅ 测试用例2通过 - 没有抛出错误');
            console.log('原始:', testCase2.replace(/\n/g, '\\n'));
            console.log('结果:', result2.replace(/\n/g, '\\n'));
        } catch (error) {
            console.log('❌ 测试用例2失败:', error.message);
        }
        
        // 测试用例3: 只有闭合大括号
        console.log('\n测试用例3: 只有闭合大括号');
        const testCase3 = `}
}`;
        
        try {
            const result3 = formatThriftCode.call(formatter, testCase3, config);
            console.log('✅ 测试用例3通过 - 没有抛出错误');
            console.log('原始:', testCase3.replace(/\n/g, '\\n'));
            console.log('结果:', result3.replace(/\n/g, '\\n'));
        } catch (error) {
            console.log('❌ 测试用例3失败:', error.message);
        }
        
        // 测试用例4: 正常情况验证
        console.log('\n测试用例4: 正常情况验证');
        const testCase4 = `struct User {
  1: required string name,
  2: optional i32 age,
}`;
        
        try {
            const result4 = formatThriftCode.call(formatter, testCase4, config);
            console.log('✅ 测试用例4通过 - 正常格式化');
            console.log('原始:', testCase4.replace(/\n/g, '\\n'));
            console.log('结果:', result4.replace(/\n/g, '\\n'));
        } catch (error) {
            console.log('❌ 测试用例4失败:', error.message);
        }
        
    } else {
        console.log('❌ 无法访问格式化方法');
    }
    
} catch (error) {
    console.log('❌ 格式化器加载失败:', error.message);
}

console.log('\n🎯 边界情况测试完成');
console.log('如果所有测试用例都通过，说明负缩进问题已修复');