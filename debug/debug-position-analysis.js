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
const {ThriftReferencesProvider} = require('./out/src/referencesProvider.js');

async function debugPositionAnalysis() {
    console.log('=== Position Analysis Debug ===\n');

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
    if (wordRange) {
        const lineText = lines[wordRange.start.line];
        const word = lineText.substring(wordRange.start.character, wordRange.end.character);
        console.log(`Extracted word: "${word}"`);
        console.log(`Word range: [${wordRange.start.line}, ${wordRange.start.character}] - [${wordRange.end.line}, ${wordRange.end.character}]`);
    } else {
        console.log('No word range found');
        return;
    }

    // 解析AST并分析节点位置
    console.log('\n--- Parsing AST ---');
    const parser = new ThriftParser(mainContent);
    const ast = parser.parse();

    // 查找指定位置的节点
    console.log('\n--- Finding node at position ---');
    const provider = new ThriftReferencesProvider();

    // 手动调用 findNodeAtPosition 方法
    // 我们需要访问私有方法，所以直接复制其实现
    function findNodeAtPosition(doc, pos) {
        // Find the deepest node that contains the position
        function findDeepestNode(nodesArray) {
            console.log(`Checking ${nodesArray ? nodesArray.length : 0} nodes`);
            if (!nodesArray) return undefined;

            for (const node of nodesArray) {
                console.log(`Checking node: type=${node.type}, name=${node.name}, range=[${node.range.start.line},${node.range.start.character}]-[${node.range.end.line},${node.range.end.character}]`);
                console.log(`Position [${pos.line},${pos.character}] inside range: ${node.range.contains(pos)}`);

                if (node.range.contains(pos)) {
                    console.log(`Node contains position, checking children...`);
                    // Check children first
                    if (node.children) {
                        const childResult = findDeepestNode(node.children);
                        if (childResult) {
                            console.log(`Found child node: ${childResult.name}`);
                            return childResult;
                        }
                    }
                    console.log(`Returning this node: ${node.name}`);
                    return node;
                }
            }
            return undefined;
        }

        return findDeepestNode(doc.body);
    }

    const foundNode = findNodeAtPosition(ast, position);
    if (foundNode) {
        console.log(`\nFound node at position: type=${foundNode.type}, name=${foundNode.name}`);
    } else {
        console.log('\nNo node found at position');
    }

    // 遍历所有节点以查看完整的AST结构
    console.log('\n--- Full AST Traversal ---');

    function traverseAndLog(node, depth = 0) {
        const indent = '  '.repeat(depth);
        console.log(`${indent}${node.type}: ${node.name || '(unnamed)'} [${node.range.start.line},${node.range.start.character}]-[${node.range.end.line},${node.range.end.character}]`);

        if (node.children && node.children.length > 0) {
            node.children.forEach(child => traverseAndLog(child, depth + 1));
        }

        // 特定节点类型的额外属性
        if (node.type === 'Struct' && node.fields) {
            node.fields.forEach(field => traverseAndLog(field, depth + 1));
        } else if (node.type === 'Service' && node.functions) {
            node.functions.forEach(func => traverseAndLog(func, depth + 1));
        } else if (node.type === 'Function' && (node.arguments || node.throws)) {
            if (node.arguments) node.arguments.forEach(arg => traverseAndLog(arg, depth + 1));
            if (node.throws) node.throws.forEach(throwNode => traverseAndLog(throwNode, depth + 1));
        }
    }

    ast.body.forEach(node => traverseAndLog(node));
}

debugPositionAnalysis().catch(console.error);