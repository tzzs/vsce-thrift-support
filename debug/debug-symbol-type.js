const fs = require('fs');
const path = require('path');

// Setup vscode mock before loading any modules that depend on it
const mockVscode = require('./tests/mock-vscode.js');

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
    fs: {
        readFile: async (uri) => {
            const content = fs.readFileSync(uri.fsPath, 'utf-8');
            return Buffer.from(content, 'utf-8');
        }
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

const {ThriftParser} = require('./out/src/ast/parser.js');

// 模拟 ThriftNodeType 枚举
const ThriftNodeType = {
    Struct: 'Struct',
    Union: 'Union',
    Exception: 'Exception',
    Enum: 'Enum',
    Service: 'Service',
    Typedef: 'Typedef',
    Const: 'Const',
    Field: 'Field',
    Function: 'Function',
    EnumMember: 'EnumMember'
};

async function debugGetSymbolType() {
    console.log('=== Get Symbol Type Debug ===\n');

    // 读取真实的测试文件
    const mainFilePath = path.join(__dirname, 'tests', 'test-files', 'main.thrift');
    const mainContent = fs.readFileSync(mainFilePath, 'utf-8');

    console.log('Main file content:');
    console.log(mainContent);
    console.log('\n' + '='.repeat(50) + '\n');

    // 分析文件内容和行数
    const lines = mainContent.split('\n');
    console.log('Lines in file:');
    lines.forEach((line, index) => {
        console.log(`${index}: ${JSON.stringify(line)}`);
    });

    console.log('\n' + '='.repeat(50) + '\n');

    // 创建模拟文档
    const document = {
        uri: mockVscode.Uri.file(mainFilePath),
        getText: () => mainContent,
        getWordRangeAtPosition: (position) => {
            console.log(`\n--- Getting word range at position [${position.line}, ${position.character}] ---`);
            return mockVscode.getWordRangeAtPositionFromText(mainContent, position);
        }
    };

    // 定位到 "User" 结构体定义的位置 (第4行，第7个字符)
    const position = new mockVscode.Position(4, 7);
    console.log(`Looking for word at position: Line ${position.line}, Character ${position.character}`);

    // 验证一下实际获取到的单词是什么
    const wordRange = document.getWordRangeAtPosition(position);
    let symbolName = '';
    if (wordRange) {
        const lineText = lines[wordRange.start.line];
        symbolName = lineText.substring(wordRange.start.character, wordRange.end.character);
        console.log(`Extracted word: "${symbolName}"`);
        console.log(`Word range: [${wordRange.start.line}, ${wordRange.start.character}] - [${wordRange.end.line}, ${wordRange.end.character}]`);
    } else {
        console.log('No word range found');
        return;
    }

    // 模拟 getSymbolType 方法的实现
    console.log('\n--- Simulating getSymbolType method ---');

    // Use AST to determine symbol type
    const parser = new ThriftParser(mainContent);
    const ast = parser.parse();

    console.log('AST parsed successfully');

    // Find the node containing the position
    const node = findNodeAtPosition(ast, position);
    console.log(`Found node: ${node ? node.name : 'null'}`);

    if (!node) {
        console.log('No node found at position');
        return null;
    }

    // Check if the symbol is a definition
    console.log(`Comparing node.name="${node.name}" with symbolName="${symbolName}"`);
    if (node.name === symbolName) {
        console.log('Node name matches symbol name');
        switch (node.type) {
            case ThriftNodeType.Struct:
            case ThriftNodeType.Union:
            case ThriftNodeType.Exception:
            case ThriftNodeType.Enum:
            case ThriftNodeType.Service:
            case ThriftNodeType.Typedef:
            case ThriftNodeType.Const:
                console.log('Returning "type"');
                return 'type';
            case ThriftNodeType.Field:
                console.log('Returning "field"');
                return 'field';
            case ThriftNodeType.Function:
                console.log('Returning "method"');
                return 'method';
            case ThriftNodeType.EnumMember:
                console.log('Returning "enumValue"');
                return 'enumValue';
            default:
                console.log(`Unknown node type: ${node.type}`);
                return null;
        }
    } else {
        console.log('Node name does not match symbol name');
    }

    console.log('Returning null');
    return null;

    // Helper function to find node at position
    function findNodeAtPosition(doc, pos) {
        // Find the deepest node that contains the position
        function findDeepestNode(nodesArray) {
            if (!nodesArray) return undefined;

            for (const node of nodesArray) {
                if (node.range.contains(pos)) {
                    // Check children first
                    if (node.children) {
                        const childResult = findDeepestNode(node.children);
                        if (childResult) {
                            return childResult;
                        }
                    }
                    return node;
                }
            }
            return undefined;
        }

        return findDeepestNode(doc.body);
    }
}

debugGetSymbolType().catch(console.error);