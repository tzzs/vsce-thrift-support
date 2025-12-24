const fs = require('fs');
const path = require('path');

// Setup vscode mock before loading any modules that depend on it
const mockVscode = require('./tests/mock-vscode.js');

const {Location, Range, Position} = mockVscode;

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

console.log('Testing detailed references...\n');

const {ThriftParser} = require('./out/src/ast/parser.js');
const nodes = require('./out/src/ast/nodes.js');
const {ThriftReferencesProvider} = require('./out/src/referencesProvider.js');

// Test document text
const text = `struct User {
  1: required i32 id
}

service UserService {
  User getUser(1: i32 userId),
  void createUser(1: User user)
}`;

console.log('Document text:');
console.log(text);
console.log('');

// Parse the document to see the AST structure
console.log('Parsing document to show AST structure...');
const parser = new ThriftParser(text);
const ast = parser.parse();
console.log('Parsed AST:');

function logAST(node, depth = 0) {
    const indent = '  '.repeat(depth);
    console.log(`${indent}${node.type}${node.name ? ':' + node.name : ''} [${node.range.start.line}:${node.range.start.character}-${node.range.end.line}:${node.range.end.character}]`);

    if (node.children && Array.isArray(node.children)) {
        node.children.forEach(child => logAST(child, depth + 1));
    }

    // Handle specific node types with nested structures
    if (node.type === nodes.ThriftNodeType.Document) {
        const doc = node;
        if (doc.body && Array.isArray(doc.body)) {
            doc.body.forEach(child => logAST(child, depth + 1));
        }
    } else if (node.type === nodes.ThriftNodeType.Struct ||
        node.type === nodes.ThriftNodeType.Union ||
        node.type === nodes.ThriftNodeType.Exception) {
        const struct = node;
        if (struct.fields && Array.isArray(struct.fields)) {
            struct.fields.forEach(field => logAST(field, depth + 1));
        }
    } else if (node.type === nodes.ThriftNodeType.Enum) {
        const enumNode = node;
        if (enumNode.members && Array.isArray(enumNode.members)) {
            enumNode.members.forEach(member => logAST(member, depth + 1));
        }
    } else if (node.type === nodes.ThriftNodeType.Service) {
        const service = node;
        if (service.functions && Array.isArray(service.functions)) {
            service.functions.forEach(func => logAST(func, depth + 1));
        }
    } else if (node.type === nodes.ThriftNodeType.Function) {
        const func = node;
        if (func.arguments && Array.isArray(func.arguments)) {
            func.arguments.forEach(arg => logAST(arg, depth + 1));
        }
        if (func.throws && Array.isArray(func.throws)) {
            func.throws.forEach(throwNode => logAST(throwNode, depth + 1));
        }
    }
}

logAST(ast);

console.log('\n--- Testing findReferencesInDocument ---');

// Create a mock document
function createMockDocument(text, fileName = 'test.thrift') {
    const lines = text.split('\n');
    return {
        uri: {fsPath: path.join(__dirname, fileName)},
        getText: (range) => {
            if (!range) return text;
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

// Test the references provider
async function testReferences() {
    const provider = new ThriftReferencesProvider();

    const document = createMockDocument(text, 'test.thrift');
    const position = createMockPosition(0, 7); // On "User" in struct definition

    console.log(`Position: Line ${position.line}, Character ${position.character}`);

    // Get word range at position
    const wordRange = document.getWordRangeAtPosition(position);
    if (wordRange) {
        console.log(`Word range: [${wordRange.start.line}:${wordRange.start.character}] to [${wordRange.end.line}:${wordRange.end.character}]`);
        const symbolName = document.getText(wordRange);
        console.log(`Symbol name: ${symbolName}`);

        // Manually test findReferencesInDocument
        console.log('\n--- Manual reference search ---');
        const references = await provider.findReferencesInDocument(document.uri, text, symbolName);
        console.log(`Found ${references.length} references`);
        console.log('References:', references);

        // Show detailed reference information
        references.forEach((ref, index) => {
            console.log(`Reference ${index + 1}:`);
            console.log(`  URI: ${ref.uri.fsPath}`);
            console.log(`  Range: [${ref.range.start.line}:${ref.range.start.character}] to [${ref.range.end.line}:${ref.range.end.character}]`);

            // Try to extract the text at this range
            try {
                const refText = document.getText(ref.range);
                console.log(`  Text: "${refText}"`);
            } catch (e) {
                console.log(`  Error extracting text: ${e.message}`);
            }
        });
    } else {
        console.log('No word range found at position');
    }
}

testReferences().catch(console.error);