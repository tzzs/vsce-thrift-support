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
    console.log('\nRunning multiline function range tests...');

    const content = [
        'service S {',
        '  User getUser(',
        '    1: map<string, i32> ids,',
        '    2: optional string name',
        '  ) throws (',
        '    1: Error err',
        '  )',
        '}'
    ].join('\n');

    const parser = new ThriftParser(content);
    const ast = parser.parse();
    const func = ast.body[0]?.functions?.[0];

    assert.ok(func?.range, 'Function should include a range');
    assert.strictEqual(func.range.end.line, 6);
    assert.strictEqual(func.range.end.character, 2);

    console.log('Multiline function range tests passed.');
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});
