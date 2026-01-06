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
    console.log('\nRunning member declaration parsing tests...');

    const content = [
        'struct User {',
        '  1: required string name,',
        '  2: optional list<i32> ids = [1, 2] (anno="x")',
        '}',
        '',
        'enum Status {',
        '  OK = 1,',
        '  FAIL',
        '}',
        '',
        'service S {',
        '  oneway void ping(1: i32 id) throws (1: Error err)',
        '}'
    ].join('\n');

    const parser = new ThriftParser(content);
    const ast = parser.parse();

    const structNode = ast.body.find(n => n.type === 'Struct');
    const enumNode = ast.body.find(n => n.type === 'Enum');
    const serviceNode = ast.body.find(n => n.type === 'Service');

    const fieldOne = structNode?.fields?.[0];
    const fieldTwo = structNode?.fields?.[1];

    assert.strictEqual(fieldOne?.id, 1);
    assert.strictEqual(fieldOne?.requiredness, 'required');
    assert.strictEqual(fieldOne?.fieldType, 'string');
    assert.strictEqual(fieldOne?.name, 'name');

    assert.strictEqual(fieldTwo?.id, 2);
    assert.strictEqual(fieldTwo?.requiredness, 'optional');
    assert.strictEqual(fieldTwo?.fieldType, 'list<i32>');
    assert.strictEqual(fieldTwo?.name, 'ids');
    assert.strictEqual(fieldTwo?.defaultValue, '[1, 2]');

    const enumOk = enumNode?.members?.[0];
    const enumFail = enumNode?.members?.[1];

    assert.strictEqual(enumOk?.name, 'OK');
    assert.strictEqual(enumOk?.initializer, '1');
    assert.strictEqual(enumFail?.name, 'FAIL');
    assert.strictEqual(enumFail?.initializer, undefined);

    const func = serviceNode?.functions?.[0];
    assert.strictEqual(func?.name, 'ping');
    assert.strictEqual(func?.returnType, 'void');
    assert.strictEqual(func?.oneway, true);
    assert.strictEqual(func?.arguments?.length, 1);
    assert.strictEqual(func?.throws?.length, 1);

    console.log('Member declaration parsing tests passed.');
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});
