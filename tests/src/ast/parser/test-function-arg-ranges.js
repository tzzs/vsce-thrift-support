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

function sliceByRange(lines, range) {
    if (!range) return null;
    if (range.start.line === range.end.line) {
        return lines[range.start.line].slice(range.start.character, range.end.character);
    }
    const parts = [];
    for (let line = range.start.line; line <= range.end.line; line++) {
        const text = lines[line] ?? '';
        if (line === range.start.line) {
            parts.push(text.slice(range.start.character));
        } else if (line === range.end.line) {
            parts.push(text.slice(0, range.end.character));
        } else {
            parts.push(text);
        }
    }
    return parts.join('\n');
}

async function run() {
    console.log('\nRunning function arg range tests...');

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

    const lines = content.split('\n');
    const parser = new ThriftParser(content);
    const ast = parser.parse();
    const serviceNode = ast.body.find(n => n.type === 'Service');
    const func = serviceNode?.functions?.[0];

    const argOne = func?.arguments?.[0];
    const argTwo = func?.arguments?.[1];
    const throwOne = func?.throws?.[0];

    assert.strictEqual(sliceByRange(lines, argOne?.typeRange)?.trim(), 'map<string, i32>');
    assert.strictEqual(sliceByRange(lines, argOne?.nameRange)?.trim(), 'ids');
    assert.strictEqual(sliceByRange(lines, argTwo?.typeRange)?.trim(), 'string');
    assert.strictEqual(sliceByRange(lines, argTwo?.nameRange)?.trim(), 'name');

    assert.strictEqual(sliceByRange(lines, throwOne?.typeRange)?.trim(), 'Error');
    assert.strictEqual(sliceByRange(lines, throwOne?.nameRange)?.trim(), 'err');

    console.log('Function arg range tests passed.');
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});
