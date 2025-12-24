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
    textDocuments: [],
    fs: {
        readFile: async (uri) => {
            // Read the actual test files
            const fs = require('fs');
            const content = fs.readFileSync(uri.fsPath, 'utf-8');
            return Buffer.from(content, 'utf-8');
        }
    },
    openTextDocument: async (uri) => {
        // Read the actual test files
        const fs = require('fs');
        const content = fs.readFileSync(uri.fsPath, 'utf-8');

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
    file: (filePath) => new mockVscode.Uri('file', '', filePath, '', '')
};

// Hook require('vscode') to return our mock
const Module = require('module');
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
    if (request === 'vscode') return mockVscode;
    return originalLoad.apply(this, arguments);
};

const {ThriftReferencesProvider} = require('./out/src/referencesProvider.js');
const {ThriftParser} = require('./out/src/ast/parser.js');

function createMockDocument(text, fileName = 'test.thrift', uri = null) {
    const lines = text.split('\n');
    return {
        uri: uri || {fsPath: path.join(__dirname, 'tests', 'test-files', fileName)},
        getText: (range) => {
            if (!range) return text;
            // Extract text within the specified range
            const startLine = range.start.line;
            const endLine = range.end.line;
            const startChar = range.start.character;
            const endChar = range.end.character;

            if (startLine === endLine) {
                return lines[startLine].substring(startChar, endChar);
            } else {
                let result = lines[startLine].substring(startChar);
                for (let i = startLine + 1; i < endLine; i++) {
                    result += '\n' + lines[i];
                }
                result += '\n' + lines[endLine].substring(0, endChar);
                return result;
            }
        },
        lineAt: (line) => ({text: lines[line] || ''}),
        getWordRangeAtPosition: (position) => {
            const lineText = lines[position.line] || '';
            // 更精确地匹配单词边界
            const wordRegex = /\b([A-Za-z_][A-Za-z0-9_]*)\b/g;
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

function createMockPosition(line, character) {
    return new mockVscode.Position(line, character);
}

function createMockCancellationToken() {
    return {isCancellationRequested: false};
}

function createMockReferenceContext() {
    return {includeDeclaration: true};
}

function findNodeAtPosition(doc, position) {
    // Find the deepest node that contains the position
    function findDeepestNode(nodesArray) {
        for (const node of nodesArray) {
            if (node.range.contains(position)) {
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

function logAST(node, depth) {
    const indent = '  '.repeat(depth);
    console.log(`${indent}${node.type}${node.name ? ':' + node.name : ''} [${node.range.start.line}:${node.range.start.character}-${node.range.end.line}:${node.range.end.character}]`);

    if (node.children && Array.isArray(node.children)) {
        node.children.forEach(child => logAST(child, depth + 1));
    }

    // Handle specific node types with nested structures
    if (node.type === 'Document') {
        if (node.body && Array.isArray(node.body)) {
            node.body.forEach(child => logAST(child, depth + 1));
        }
    } else if (node.type === 'Struct' || node.type === 'Union' || node.type === 'Exception') {
        if (node.fields && Array.isArray(node.fields)) {
            node.fields.forEach(field => logAST(field, depth + 1));
        }
    } else if (node.type === 'Enum') {
        if (node.members && Array.isArray(node.members)) {
            node.members.forEach(member => logAST(member, depth + 1));
        }
    } else if (node.type === 'Service') {
        if (node.functions && Array.isArray(node.functions)) {
            node.functions.forEach(func => logAST(func, depth + 1));
        }
    } else if (node.type === 'Function') {
        if (node.arguments && Array.isArray(node.arguments)) {
            node.arguments.forEach(arg => logAST(arg, depth + 1));
        }
        if (node.throws && Array.isArray(node.throws)) {
            node.throws.forEach(throwNode => logAST(throwNode, depth + 1));
        }
    }
}

async function debugDetailedMethodReference() {
    console.log('=== Debugging Detailed Method Reference ===\n');

    const provider = new ThriftReferencesProvider();

    const text = `service UserService {
  User getUser(1: i32 userId),
  void createUser(1: User user)
}`;
    const document = createMockDocument(text, 'test.thrift');

    // 测试不同的位置
    const positions = [
        {line: 1, character: 2, desc: "On 'User' return type"},
        {line: 1, character: 6, desc: "On 'getUser' method name"},
        {line: 1, character: 15, desc: "On 'i32' parameter type"},
        {line: 1, character: 20, desc: "On 'userId' parameter name"}
    ];

    console.log('Test text:');
    console.log(text);
    console.log('');

    // Parse AST to see what we get
    const parser = new ThriftParser(text);
    const ast = parser.parse();
    console.log('Parsed AST:');
    logAST(ast, 0);
    console.log('');

    for (const pos of positions) {
        const position = createMockPosition(pos.line, pos.character);
        console.log(`--- Position: line=${position.line}, character=${position.character} (${pos.desc}) ---`);

        // Find node at position
        const node = findNodeAtPosition(ast, position);
        console.log(`Node at position: ${node ? `${node.type}:${node.name}` : 'null'}`);
        console.log('');

        // Get word range at position
        const wordRange = document.getWordRangeAtPosition(position);
        if (wordRange) {
            const symbolName = document.getText(wordRange);
            console.log(`Symbol at position: "${symbolName}"`);

            // Try to get symbol type
            const symbolType = await provider['getSymbolType'](document, position, symbolName);
            console.log(`Symbol type: ${symbolType || 'null'}`);
        } else {
            console.log('No symbol found at position');
        }
        console.log('');
    }
}

async function runDebugAnalysis() {
    console.log('=== Running Detailed Method Reference Debug Analysis ===\n');

    try {
        await debugDetailedMethodReference();
        console.log('\n✅ Debug analysis completed!');
    } catch (error) {
        console.error('\n❌ Debug analysis failed:', error);
        process.exit(1);
    }
}

runDebugAnalysis().catch((error) => {
    console.error('Debug analysis execution failed:', error);
    process.exit(1);
});