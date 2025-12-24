const fs = require('fs');
const path = require('path');

// Setup vscode mock before loading any modules that depend on it
const mockVscode = require('./tests/mock-vscode.js');

const {Position, Range} = mockVscode;

// Use the Uri class from mockVscode
mockVscode.Uri.file = (filePath) => new mockVscode.Uri('file', '', filePath, '', '');
mockVscode.Uri.parse = (uri) => new mockVscode.Uri('file', '', uri.replace('file:///', ''), '', '');

// Hook require('vscode') to return our mock
const Module = require('module');
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
    if (request === 'vscode') return mockVscode;
    return originalLoad.apply(this, arguments);
};

console.log('=== 调试 Word Range 获取 ===');

// 测试文本
const text = `struct User {
  1: required i32 id
}

service UserService {
  User getUser(1: i32 userId),
  void createUser(1: User user)
}`;

console.log('测试文本:');
console.log(text);

// 模拟文档对象
const document = {
    getText: () => text,
    getWordRangeAtPosition: (position) => {
        const lines = text.split('\n');
        const lineText = lines[position.line] || '';
        console.log(`第${position.line}行文本: "${lineText}"`);
        console.log(`字符位置: ${position.character}`);

        const wordRegex = /[A-Za-z_][A-Za-z0-9_]*/g;
        let match;
        while ((match = wordRegex.exec(lineText)) !== null) {
            console.log(`匹配到单词: "${match[0]}" 在位置 [${match.index}, ${match.index + match[0].length})`);
            if (position.character >= match.index && position.character <= match.index + match[0].length) {
                console.log(`选择单词: "${match[0]}"`);
                return new mockVscode.Range(position.line, match.index, position.line, match.index + match[0].length);
            }
        }
        console.log('未找到匹配的单词');
        return null;
    }
};

// 测试位置 (0, 7) - 应该匹配到 "User"
const position = new mockVscode.Position(0, 7);
console.log(`\n测试位置: line=${position.line}, character=${position.character}`);

const wordRange = document.getWordRangeAtPosition(position);
if (wordRange) {
    console.log(`找到单词范围: [${wordRange.start.line}, ${wordRange.start.character}] - [${wordRange.end.line}, ${wordRange.end.character}]`);
    // 正确提取符号名
    const lines = text.split('\n');
    const symbolName = lines[wordRange.start.line].substring(wordRange.start.character, wordRange.end.character);
    console.log(`提取的符号名: "${symbolName}"`);
} else {
    console.log('未找到单词范围');
}