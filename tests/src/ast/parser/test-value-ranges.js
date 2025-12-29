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
    const parts = [];
    parts.push((lines[range.start.line] ?? '').slice(range.start.character));
    for (let i = range.start.line + 1; i < range.end.line; i++) {
        parts.push(lines[i] ?? '');
    }
    parts.push((lines[range.end.line] ?? '').slice(0, range.end.character));
    return parts.join('\\n');
}

async function run() {
    console.log('\\nRunning AST value range tests...');

    const content = [
        'typedef string Name',
        'const map<string, i32> KV = {',
        '  \"a\": 1,',
        '  \"b\": 2',
        '}',
        '',
        'enum Status {',
        '  Active = 1,',
        '  Disabled',
        '}',
        '',
        'struct User {',
        '  1: optional string name = \"abc\"',
        '  2: list<i32> ids = [1, 2]',
        '}'
    ].join('\n');

    const lines = content.split('\n');
    const parser = new ThriftParser(content);
    const ast = parser.parse();

    const constNode = ast.body.find(n => n.type === 'Const');
    const enumNode = ast.body.find(n => n.type === 'Enum');
    const structNode = ast.body.find(n => n.type === 'Struct');

    // Const 值范围（多行）
    assert.ok(constNode?.valueRange, 'const 应包含 valueRange');
    const constValue = sliceByRange(lines, constNode.valueRange);
    assert.ok(constValue?.startsWith('{'), 'const 值应以 { 开始');
    assert.ok(constValue?.trim().endsWith('}'), 'const 值应以 } 结束');

    // Enum initializer 范围
    const active = enumNode?.members?.find(m => m.name === 'Active');
    assert.ok(active?.initializerRange, 'enum 成员应包含 initializerRange');
    assert.strictEqual(sliceByRange(lines, active.initializerRange), '1');

    // 字段默认值范围
    const nameField = structNode?.fields?.find(f => f.name === 'name');
    assert.ok(nameField?.defaultValueRange, '字段应包含 defaultValueRange');
    assert.strictEqual(sliceByRange(lines, nameField.defaultValueRange), '\"abc\"');

    const idsField = structNode?.fields?.find(f => f.name === 'ids');
    assert.ok(idsField?.defaultValueRange, '字段应包含 defaultValueRange');
    assert.strictEqual(sliceByRange(lines, idsField.defaultValueRange), '[1, 2]');

    console.log('AST value range tests passed.');
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});
