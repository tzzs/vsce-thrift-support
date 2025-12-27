const assert = require('assert');
const path = require('path');
const fs = require('fs');
const Module = require('module');

// Mock VS Code API
const mockVscode = {
    Range: class {
        constructor(startLine, startChar, endLine, endChar) {
            this.start = {line: startLine, character: startChar};
            this.end = {line: endLine, character: endChar};
        }
    },
    Position: class {
        constructor(line, char) {
            this.line = line;
            this.character = char;
        }
    },
    Uri: {
        file: (f) => ({fsPath: f, toString: () => f})
    },
    workspace: {
        fs: {
            readFile: async () => Buffer.from('')
        },
        textDocuments: []
    }
};

// Override require to serve mock vscode
const originalRequire = Module.prototype.require;
Module.prototype.require = function (id) {
    if (id === 'vscode') {
        return mockVscode;
    }
    return originalRequire.call(this, id);
};

const {ThriftParser} = require('../../../../out/src/ast/parser.js');

async function testThriftParserStringInput() {
    console.log('Testing ThriftParser with string input...');

    const thriftContent = `
    namespace java com.example
    
    struct User {
        1: required string name
        2: optional i32 age
    }
    
    service UserService {
        User getUser(1: i32 id)
    }
    `;

    const parser = new ThriftParser(thriftContent);
    const ast = parser.parse();

    console.log('Parsed AST body length:', ast.body.length);
    console.log('Parsed AST body types:', ast.body.map(n => n.type));

    assert.strictEqual(ast.body.length, 3, 'Should parse 3 nodes (namespace, struct, service)');
    assert.strictEqual(ast.body[0].type, 'Namespace');
    assert.strictEqual(ast.body[1].type, 'Struct');
    assert.strictEqual(ast.body[2].type, 'Service');

    console.log('ThriftParser string input test passed!');
}

async function runTests() {
    try {
        await testThriftParserStringInput();
        console.log('All tests passed!');
    } catch (err) {
        console.error('Test failed:', err);
        process.exit(1);
    }
}

runTests();
