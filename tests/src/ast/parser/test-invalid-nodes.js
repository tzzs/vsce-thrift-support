const assert = require('assert');
const Module = require('module');

const mockVscode = {
    Range: class {
        constructor(startLine, startChar, endLine, endChar) {
            this.start = { line: startLine, character: startChar };
            this.end = { line: endLine, character: endChar };
        }
    },
    Position: class {
        constructor(line, char) {
            this.line = line;
            this.character = char;
        }
    },
    Uri: {
        file: (f) => ({ fsPath: f, toString: () => f })
    },
    workspace: {
        fs: {
            readFile: async () => Buffer.from('')
        },
        textDocuments: []
    }
};

const originalRequire = Module.prototype.require;
Module.prototype.require = function (id) {
    if (id === 'vscode') {
        return mockVscode;
    }
    return originalRequire.apply(this, arguments);
};

const { ThriftParser } = require('../../../../out/ast/parser.js');

async function run() {
    console.log('\nRunning invalid node recovery tests...');

    const content = [
        'namespace java',
        'include shared.thrift',
        'struct {',
        '}',
        'const = 1',
        'typedef list<string>'
    ].join('\n');

    const parser = new ThriftParser(content);
    const ast = parser.parse();
    const invalidNodes = ast.body.filter(n => n.type === 'Invalid');

    assert.ok(invalidNodes.length >= 3, 'Should create invalid nodes for broken declarations');
    assert.ok(invalidNodes.some(node => node.raw.includes('namespace')));
    assert.ok(invalidNodes.some(node => node.raw.includes('include')));
    assert.ok(invalidNodes.some(node => node.raw.includes('const')));

    console.log('Invalid node recovery tests passed.');
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});
