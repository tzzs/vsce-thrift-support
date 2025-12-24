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

console.log('=== 测试在真实文件中查找 References ===');

async function debugRealFileReferences() {
    console.log('\n--- 测试在真实文件中查找 User 引用 ---');

    const provider = new ThriftReferencesProvider();

    // 读取真实的测试文件
    const mainFilePath = path.join(__dirname, 'tests', 'test-files', 'main.thrift');
    const sharedFilePath = path.join(__dirname, 'tests', 'test-files', 'shared.thrift');

    const mainContent = fs.readFileSync(mainFilePath, 'utf-8');
    const sharedContent = fs.readFileSync(sharedFilePath, 'utf-8');

    console.log('Main file content:');
    console.log(mainContent);
    console.log('\nShared file content:');
    console.log(sharedContent);

    try {
        console.log('\n--- 测试在 main.thrift 中查找 User 引用 ---');
        const mainUri = mockVscode.Uri.file(mainFilePath);
        const mainReferences = await provider['findReferencesInDocument'](mainUri, mainContent, 'User');
        console.log('Main file references count:', mainReferences.length);
        console.log('Main file references:', mainReferences);
    } catch (error) {
        console.error('在 main.thrift 中查找 User 引用时出错:', error);
        console.error('错误堆栈:', error.stack);
    }

    try {
        console.log('\n--- 测试在 shared.thrift 中查找 User 引用 ---');
        const sharedUri = mockVscode.Uri.file(sharedFilePath);
        const sharedReferences = await provider['findReferencesInDocument'](sharedUri, sharedContent, 'User');
        console.log('Shared file references count:', sharedReferences.length);
        console.log('Shared file references:', sharedReferences);
    } catch (error) {
        console.error('在 shared.thrift 中查找 User 引用时出错:', error);
        console.error('错误堆栈:', error.stack);
    }

    // 现在测试完整的 provideReferences 方法
    console.log('\n--- 测试完整的 provideReferences 方法 ---');

    // 创建模拟文档，使用真实的 main.thrift 内容
    const document = {
        uri: mockVscode.Uri.file(mainFilePath),
        getText: () => mainContent,
        getWordRangeAtPosition: (position) => {
            const lines = mainContent.split('\n');
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

    // 定位到 "User" 结构体定义的位置 (第4行，第7个字符)
    const position = new mockVscode.Position(4, 7);
    const context = {includeDeclaration: true};
    const token = {isCancellationRequested: false};

    try {
        console.log('\n--- 调用 provideReferences 查找 User 引用 ---');
        const references = await provider.provideReferences(document, position, context, token);
        console.log('Total references found:', references.length);
        console.log('References:', references);
    } catch (error) {
        console.error('provideReferences 出错:', error);
        console.error('错误堆栈:', error.stack);
    }
}

async function main() {
    try {
        await debugRealFileReferences();
    } catch (error) {
        console.error('调试过程中出现错误:', error);
    }
}

main();