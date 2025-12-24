const fs = require('fs');
const path = require('path');

// Setup vscode mock before loading any modules that depend on it
const mockVscode = require('./tests/mock-vscode.js');

const {Location, Range, Position} = mockVscode;

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

struct User {
  1: required i32 id,
  2: optional string name,
  3: required Status status
}

service UserService {
  User getUser(1: i32 userId),
  void createUser(1: User user),
  Status getUserStatus(1: i32 userId)
}`;
        } else if (fileName === 'shared.thrift') {
            content = `namespace java com.example.shared

enum Status {
  ACTIVE = 1,
  INACTIVE = 2,
  PENDING = 3
}

const i32 MAX_USERS = 1000`;
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

struct User {
  1: required i32 id,
  2: optional string name,
  3: required Status status
}

service UserService {
  User getUser(1: i32 userId),
  void createUser(1: User user),
  Status getUserStatus(1: i32 userId)
}`;
            } else if (fileName === 'shared.thrift') {
                content = `namespace java com.example.shared

enum Status {
  ACTIVE = 1,
  INACTIVE = 2,
  PENDING = 3
}

const i32 MAX_USERS = 1000`;
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

console.log('=== 详细调试 References Provider ===');

async function debugWordExtraction() {
    console.log('\n--- 测试单词提取 ---');

    const text = `struct User {
  1: required i32 id
}

service UserService {
  User getUser(1: i32 userId),
  void createUser(1: User user)
}`;

    console.log('测试文本:');
    console.log(text);

    // 模拟文档对象，专门用于测试单词提取
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
}

async function debugASTParsing() {
    console.log('\n--- 测试 AST 解析 ---');

    // 直接测试解析器
    const {ThriftParser} = require('./out/src/ast/parser.js');

    const text = `struct User {
  1: required i32 id
}

service UserService {
  User getUser(1: i32 userId),
  void createUser(1: User user)
}`;

    try {
        const parser = new ThriftParser(text);
        const ast = parser.parse();
        console.log('AST 解析成功:');
        console.log(JSON.stringify(ast, null, 2));
    } catch (error) {
        console.error('AST 解析失败:', error);
        console.error('错误堆栈:', error.stack);
    }
}

async function debugGetSymbolType() {
    console.log('\n--- 测试 getSymbolType 方法 ---');

    const provider = new ThriftReferencesProvider();

    const text = `struct User {
  1: required i32 id
}

service UserService {
  User getUser(1: i32 userId),
  void createUser(1: User user)
}`;

    // 创建模拟文档
    const document = {
        getText: () => text,
        getWordRangeAtPosition: (position) => {
            const lines = text.split('\n');
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

    const position = new mockVscode.Position(0, 7); // On "User" in struct definition
    const wordRange = document.getWordRangeAtPosition(position);
    const symbolName = text.split('\n')[wordRange.start.line].substring(wordRange.start.character, wordRange.end.character);

    console.log(`测试符号: "${symbolName}" at position [${position.line}, ${position.character}]`);

    try {
        // 直接调用私有方法进行测试
        const symbolType = await provider['getSymbolType'](document, position, symbolName);
        console.log(`符号类型: ${symbolType}`);
    } catch (error) {
        console.error('getSymbolType 出错:', error);
        console.error('错误堆栈:', error.stack);
    }
}

async function main() {
    try {
        await debugWordExtraction();
        await debugASTParsing();
        await debugGetSymbolType();
    } catch (error) {
        console.error('调试过程中出现错误:', error);
    }
}

main();