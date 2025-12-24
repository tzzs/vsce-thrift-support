const fs = require('fs');
const path = require('path');

// Setup vscode mock before loading any modules that depend on it
const mockVscode = require('./tests/mock-vscode.js');

const {Range, Position} = mockVscode;

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

console.log('=== 简单词范围检测测试 ===');

async function debugSimpleWordRange() {
    // 读取真实的测试文件
    const mainFilePath = path.join(__dirname, 'tests', 'test-files', 'main.thrift');
    const mainContent = fs.readFileSync(mainFilePath, 'utf-8');

    console.log('Main file content:');
    console.log(mainContent);

    // 创建模拟文档，使用真实的 main.thrift 内容
    const document = {
        getText: () => mainContent,
        getWordRangeAtPosition: (position) => {
            console.log(`\n--- 尝试获取位置 [${position.line}, ${position.character}] 的词范围 ---`);
            const lines = mainContent.split('\n');
            console.log(`总共有 ${lines.length} 行`);
            const lineText = lines[position.line] || '';
            console.log(`第${position.line}行文本: "${lineText}"`);
            console.log(`目标字符位置: ${position.character}`);

            if (position.character >= lineText.length) {
                console.log(`字符位置超出行长度 (${lineText.length})`);
                return null;
            }

            const wordRegex = /[A-Za-z_][A-Za-z0-9_]*/g;
            let match;
            console.log('开始匹配...');
            while ((match = wordRegex.exec(lineText)) !== null) {
                console.log(`  匹配到单词: "${match[0]}" 在位置 [${match.index}, ${match.index + match[0].length})`);
                if (position.character >= match.index && position.character <= match.index + match[0].length) {
                    console.log(`  选中单词: "${match[0]}"`);
                    return new mockVscode.Range(position.line, match.index, position.line, match.index + match[0].length);
                }
            }
            console.log('未找到匹配的单词');
            return null;
        }
    };

    // 定位到 "User" 结构体定义的位置 (第4行，第7个字符)
    const position = new mockVscode.Position(4, 7);

    try {
        console.log('\n--- 调用 getWordRangeAtPosition 查找 User 单词 ---');
        const wordRange = document.getWordRangeAtPosition(position);
        if (wordRange) {
            console.log(`找到单词范围: [${wordRange.start.line}, ${wordRange.start.character}] - [${wordRange.end.line}, ${wordRange.end.character}]`);
            // 提取符号名
            const lines = mainContent.split('\n');
            const symbolName = lines[wordRange.start.line].substring(wordRange.start.character, wordRange.end.character);
            console.log(`提取的符号名: "${symbolName}"`);
        } else {
            console.log('未找到单词范围');
        }
    } catch (error) {
        console.error('getWordRangeAtPosition 出错:', error);
        console.error('错误堆栈:', error.stack);
    }
}

async function main() {
    try {
        await debugSimpleWordRange();
    } catch (error) {
        console.error('调试过程中出现错误:', error);
    }
}

main();