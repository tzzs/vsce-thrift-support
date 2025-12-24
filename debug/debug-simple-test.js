const fs = require('fs');
const path = require('path');

// Setup vscode mock before loading any modules that depend on it
const mockVscode = require('./tests/mock-vscode.js');

// Extend mockVscode with workspace mock
mockVscode.workspace = {
    findFiles: async (pattern, exclude) => {
        // Mock implementation - return test thrift files
        return [
            {fsPath: path.join(__dirname, 'tests', 'test-files', 'main.thrift')},
            {fsPath: path.join(__dirname, 'tests', 'test-files', 'shared.thrift')}
        ];
    },
    textDocuments: [], // Empty array as we don't have open documents in this test
    fs: {
        readFile: async (uri) => {
            // Read the actual test files
            const fs = require('fs');
            const content = fs.readFileSync(uri.fsPath, 'utf-8');
            return Buffer.from(content, 'utf-8');
        }
    }
};

// Hook require('vscode') to return our mock
const Module = require('module');
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
    if (request === 'vscode') return mockVscode;
    return originalLoad.apply(this, arguments);
};

// Load the compiled references provider
const {ThriftReferencesProvider} = require('./out/src/referencesProvider.js');

function createMockDocument(text, fileName = 'test.thrift') {
    const lines = text.split('\n');
    return {
        uri: {fsPath: path.join(__dirname, 'tests', 'test-files', fileName)},
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
            // 使用更精确的单词边界匹配
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

async function testSimpleReferences() {
    console.log('Testing simple references...');

    const provider = new ThriftReferencesProvider();

    // 使用简单的测试文本
    const text = `struct User {
  1: required i32 id
}

service UserService {
  User getUser(1: i32 userId),
  void createUser(1: User user)
}`;

    const document = createMockDocument(text, 'test.thrift');
    // 在"struct User"中的"User"位置 (行0, 列7)
    const position = createMockPosition(0, 7);

    console.log('Document text:');
    console.log(text);
    console.log('\nPosition:', position);

    // 获取单词范围
    const wordRange = document.getWordRangeAtPosition(position);
    if (wordRange) {
        const symbolName = text.substring(
            wordRange.start.line * 1000 + wordRange.start.character,
            wordRange.end.line * 1000 + wordRange.end.character
        );
        console.log('Word range:', wordRange);
        console.log('Symbol name:', symbolName);
    } else {
        console.log('No word range found');
    }

    try {
        const references = await provider.provideReferences(
            document,
            position,
            createMockReferenceContext(),
            createMockCancellationToken()
        );

        console.log(`Found ${references.length} references`);
        console.log('References:', references);
    } catch (error) {
        console.error('Error finding references:', error);
    }
}

// 运行测试
testSimpleReferences().catch(console.error);