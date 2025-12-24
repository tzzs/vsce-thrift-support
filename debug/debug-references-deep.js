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
    }
};

mockVscode.Uri = {
    file: (filePath) => ({
        fsPath: filePath,
        toString: () => `file://${filePath}`
    })
};

// Hook require('vscode') to return our mock
const Module = require('module');
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
    if (request === 'vscode') return mockVscode;
    return originalLoad.apply(this, arguments);
};

const {ThriftReferencesProvider} = require('./out/src/referencesProvider.js');

async function debugDeepReferences() {
    console.log('=== Deep References Debug ===\n');

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
        console.log('\n--- 调用 provideReferences 查找 User 引用 ---');
        const references = await provider.provideReferences(document, position, {includeDeclaration: true}, {isCancellationRequested: false});
        console.log('Total references found:', references.length);
        console.log('References:', references);

        // 详细显示每个引用的位置
        if (references.length > 0) {
            references.forEach((ref, index) => {
                console.log(`  引用 ${index + 1}: 文件 ${ref.uri.fsPath}, 位置 [${ref.range.start.line}, ${ref.range.start.character}] - [${ref.range.end.line}, ${ref.range.end.character}]`);
            });
        }
    } catch (error) {
        console.error('provideReferences 出错:', error);
        console.error('错误堆栈:', error.stack);
    }

    // 分析AST结构
    console.log('\n--- 分析AST结构 ---');
    try {
        const {ThriftParser} = require('./out/src/ast/parser.js');
        const parser = new ThriftParser(mainContent);
        const ast = parser.parse();

        console.log('AST根节点:');
        console.log(JSON.stringify(ast, null, 2));

        // 检查traverseAST方法
        console.log('\n--- 测试 traverseAST 方法 ---');
        const references = [];

        function callback(node) {
            console.log(`遍历节点: 类型=${node.type}, 名称=${node.name}`);
            if (node.name === 'User') {
                console.log(`  找到User节点!`);
                const location = new mockVscode.Location(mockVscode.Uri.file(mainFilePath), node.range);
                references.push(location);
            }

            // 对于字段类型，特殊处理
            if (node.type === 'Field') {
                console.log(`  字段节点: fieldType=${node.fieldType}`);
                if (node.fieldType === 'User') {
                    console.log(`  找到User类型的字段!`);
                    const location = new mockVscode.Location(mockVscode.Uri.file(mainFilePath), node.range);
                    references.push(location);
                }
            }
        }

        // 修改traverseAST方法以添加更多调试信息
        function traverseAST(node, callback) {
            try {
                callback(node);
            } catch (error) {
                console.error(`回调函数出错: ${error.message}`);
                console.error(`节点信息: ${JSON.stringify(node, null, 2)}`);
                throw error;
            }

            if (node.children && Array.isArray(node.children)) {
                node.children.forEach(child => traverseAST(child, callback));
            }

            // 处理特定节点类型与嵌套结构
            if (node.type === 'Struct' || node.type === 'Union' || node.type === 'Exception') {
                if (node.fields && Array.isArray(node.fields)) {
                    node.fields.forEach(field => traverseAST(field, callback));
                }
            } else if (node.type === 'Enum') {
                if (node.members && Array.isArray(node.members)) {
                    node.members.forEach(member => traverseAST(member, callback));
                }
            } else if (node.type === 'Service') {
                if (node.functions && Array.isArray(node.functions)) {
                    node.functions.forEach(func => traverseAST(func, callback));
                }
            } else if (node.type === 'Function') {
                if (node.arguments && Array.isArray(node.arguments)) {
                    node.arguments.forEach(arg => traverseAST(arg, callback));
                }
                if (node.throws && Array.isArray(node.throws)) {
                    node.throws.forEach(throwNode => traverseAST(throwNode, callback));
                }
            }
        }

        try {
            traverseAST(ast, callback);
            console.log(`总共找到 ${references.length} 个引用`);
        } catch (error) {
            console.error('traverseAST 出错:', error);
            console.error('错误堆栈:', error.stack);
        }
    } catch (error) {
        console.error('AST分析出错:', error);
        console.error('错误堆栈:', error.stack);
    }
}

debugDeepReferences().catch(console.error);