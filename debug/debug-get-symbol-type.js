const fs = require('fs');
const path = require('path');

// Setup vscode mock before loading any modules that depend on it
const mockVscode = require('./tests/mock-vscode.js');

const {Range, Position} = mockVscode;

// Extend mockVscode with workspace mock
mockVscode.workspace = {
    findFiles: async (pattern, exclude) => {
        // Mock implementation - return test thrift files
        if (pattern.includes('*.thrift')) {
            return [
                {fsPath: path.join(__dirname, 'tests', 'test-files', 'main.thrift')},
                {fsPath: path.join(__dirname, 'tests', 'test-files', 'shared.thrift')}
            ];
        }
        return [];
    },
    openTextDocument: async (uri) => {
        // Mock different file contents based on path
        const fileName = path.basename(uri.fsPath);
        let content = '';

        if (fileName === 'main.thrift') {
            content = `include "shared.thrift"

namespace java com.example.main

struct User {
  1: required i32 id,
  2: optional string name,
  3: optional shared.Address address,
  4: required shared.Priority priority = shared.Priority.LOW
}

service UserManagementService {
  User createUser(1: User user),
  void updateUser(1: i32 userId, 2: User user),
  shared.Address getAddress(1: i32 userId)
}`;
        } else if (fileName === 'shared.thrift') {
            content = `namespace java com.example.shared

enum Priority {
  LOW = 1,
  MEDIUM = 2,
  HIGH = 3
}

struct Address {
  1: required string street,
  2: optional string city,
  3: optional string country
}

const string DEFAULT_COUNTRY = "USA"`;
        }

        return {
            getText: () => content,
            uri: uri,
            lineAt: (line) => ({text: content.split('\n')[line] || ''}),
            getWordRangeAtPosition: (position) => {
                const lines = content.split('\n');
                const lineText = lines[position.line] || '';
                const wordRegex = /[A-Za-z_][A-Za-z0-9_]*/g;
                let match;
                while ((match = wordRegex.exec(lineText)) !== null) {
                    if (position.character >= match.index && position.character <= match.index + match[0].length) {
                        return new mockVscode.Range(position.line, match.index, position.line, match.index + match[0].length);
                    }
                }
                return null;
            }
        };
    },
    fs: {
        readFile: async (uri) => {
            const fileName = path.basename(uri.fsPath);
            let content = '';

            if (fileName === 'main.thrift') {
                content = `include "shared.thrift"

namespace java com.example.main

struct User {
  1: required i32 id,
  2: optional string name,
  3: optional shared.Address address,
  4: required shared.Priority priority = shared.Priority.LOW
}

service UserManagementService {
  User createUser(1: User user),
  void updateUser(1: i32 userId, 2: User user),
  shared.Address getAddress(1: i32 userId)
}`;
            } else if (fileName === 'shared.thrift') {
                content = `namespace java com.example.shared

enum Priority {
  LOW = 1,
  MEDIUM = 2,
  HIGH = 3
}

struct Address {
  1: required string street,
  2: optional string city,
  3: optional string country
}

const string DEFAULT_COUNTRY = "USA"`;
            }

            return Buffer.from(content, 'utf-8');
        }
    }
};

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

// 加载实际的referencesProvider
const {ThriftReferencesProvider} = require('./out/src/referencesProvider.js');

console.log('=== 测试 getSymbolType 方法 ===');

async function debugGetSymbolType() {
    console.log('\n--- 测试 getSymbolType 方法 ---');

    const provider = new ThriftReferencesProvider();

    // 读取真实的测试文件
    const mainFilePath = path.join(__dirname, 'tests', 'test-files', 'main.thrift');
    const mainContent = fs.readFileSync(mainFilePath, 'utf-8');

    console.log('Main file content:');
    console.log(mainContent);

    // 创建模拟文档，使用真实的 main.thrift 内容
    const document = {
        uri: mockVscode.Uri.file(mainFilePath),
        getText: () => mainContent,
        getWordRangeAtPosition: (position) => {
            console.log(`\n--- 尝试获取位置 [${position.line}, ${position.character}] 的词范围 ---`);
            const lines = mainContent.split('\n');
            const lineText = lines[position.line] || '';
            console.log(`第${position.line}行文本: "${lineText}"`);
            console.log(`目标字符位置: ${position.character}`);

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
        console.log('\n--- 首先测试 getWordRangeAtPosition ---');
        const wordRange = document.getWordRangeAtPosition(position);
        if (wordRange) {
            console.log(`找到单词范围: [${wordRange.start.line}, ${wordRange.start.character}] - [${wordRange.end.line}, ${wordRange.end.character}]`);
            // 提取符号名
            const lines = mainContent.split('\n');
            const symbolName = lines[wordRange.start.line].substring(wordRange.start.character, wordRange.end.character);
            console.log(`提取的符号名: "${symbolName}"`);

            console.log('\n--- 然后测试 getSymbolType 方法 ---');
            // 直接调用私有方法进行测试
            const symbolType = await provider['getSymbolType'](document, position, symbolName);
            console.log(`符号类型: ${symbolType}`);
        } else {
            console.log('未找到单词范围');
        }
    } catch (error) {
        console.error('getSymbolType 出错:', error);
        console.error('错误堆栈:', error.stack);
    }
}

async function main() {
    try {
        await debugGetSymbolType();
    } catch (error) {
        console.error('调试过程中出现错误:', error);
    }
}

main();