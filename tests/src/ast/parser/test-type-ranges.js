const assert = require('assert');
const Module = require('module');

// 轻量 VSCode mock（仅需 Range）
const mockVscode = {
    Range: class {
        constructor(startLine, startChar, endLine, endChar) {
            this.start = {line: startLine, character: startChar};
            this.end = {line: endLine, character: endChar};
        }
    }
};

// Hook vscode 依赖
const originalRequire = Module.prototype.require;
Module.prototype.require = function (id) {
    if (id === 'vscode') {
        return mockVscode;
    }
    return originalRequire.apply(this, arguments);
};

const {ThriftParser} = require('../../../../out/ast/parser.js');

function sliceByRange(lines, range) {
    if (!range) return null;
    if (range.start.line === range.end.line) {
        const line = lines[range.start.line] ?? '';
        return line.slice(range.start.character, range.end.character);
    }
    // 简化：仅单行切片即可覆盖当前测试场景
    return null;
}

async function run() {
    console.log('\nRunning AST type range tests...');

    const content = [
        'typedef map<string, i32> KV',
        'const string CONST_VAL = "x"',
        '',
        'struct User {',
        '  1: required list<i32> ids,',
        '}',
        '',
        'service S {',
        '  User getUser(1: i32 id)',
        '}'
    ].join('\n');

    const lines = content.split('\n');
    const parser = new ThriftParser(content);
    const ast = parser.parse();

    const typedefNode = ast.body.find(n => n.type === 'Typedef');
    const constNode = ast.body.find(n => n.type === 'Const');
    const structNode = ast.body.find(n => n.type === 'Struct');
    const serviceNode = ast.body.find(n => n.type === 'Service');

    // Typedef 类型范围
    assert.ok(typedefNode?.aliasTypeRange, 'typedef 应包含 aliasTypeRange');
    assert.strictEqual(sliceByRange(lines, typedefNode.aliasTypeRange)?.trim(), 'map<string, i32>');

    // Const 类型范围
    assert.ok(constNode?.valueTypeRange, 'const 应包含 valueTypeRange');
    assert.strictEqual(sliceByRange(lines, constNode.valueTypeRange)?.trim(), 'string');

    // Struct 字段类型范围
    const field = structNode?.fields?.[0];
    assert.ok(field?.typeRange, 'struct 字段应包含 typeRange');
    assert.strictEqual(sliceByRange(lines, field.typeRange)?.trim(), 'list<i32>');

    // Service 返回类型范围
    const func = serviceNode?.functions?.[0];
    assert.ok(func?.returnTypeRange, 'service 函数应包含 returnTypeRange');
    assert.strictEqual(sliceByRange(lines, func.returnTypeRange)?.trim(), 'User');

    console.log('AST type range tests passed.');
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});
