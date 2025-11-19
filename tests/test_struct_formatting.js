// Mock vscode module
const Module = require('module');
const originalRequire = Module.prototype.require;

Module.prototype.require = function (id) {
    if (id === 'vscode') {
        return {
            Position: class Position {
                constructor(line, character) {
                    this.line = line;
                    this.character = character;
                }
            },
            Range: class Range {
                constructor(start, end) {
                    this.start = start;
                    this.end = end;
                }
            },
            TextEdit: class TextEdit {
                static replace(range, text) {
                    return { range, newText: text };
                }
            },
            workspace: {
                getConfiguration: () => ({
                    get: (key, defaultValue) => defaultValue
                })
            }
        };
    }
    return originalRequire.apply(this, arguments);
};

const vscode = require('vscode');
const { ThriftFormattingProvider } = require('../out/formattingProvider');

const provider = new ThriftFormattingProvider();

// Test struct field formatting
function testStructFieldFormatting() {
    const input = `struct User {
  1: required UserId id,
  2: required string name,
  3: optional i32 age
}`;

    const mockDocument = {
        getText: () => input,
        lineAt: (line) => ({ text: input.split('\n')[line] || '' }),
        positionAt: (offset) => {
            const lines = input.substring(0, offset).split('\n');
            return new vscode.Position(lines.length - 1, lines[lines.length - 1].length);
        }
    };

    const edits = provider.provideDocumentFormattingEdits(
        mockDocument,
        { insertSpaces: true, tabSize: 4 },
        {}
    );

    if (!edits || edits.length === 0) {
        console.error('❌ 没有返回格式化编辑');
        return false;
    }

    const formatted = edits[0].newText;
    console.log('格式化结果:');
    console.log(formatted);
    console.log('');

    // Check: 所有字段ID都存在
    const has1 = formatted.includes('1:');
    const has2 = formatted.includes('2:');
    const has3 = formatted.includes('3:');

    if (!has1 || !has2 || !has3) {
        console.error('❌ 字段ID丢失:', { has1, has2, has3 });
        return false;
    }
    console.log('✓ 所有字段ID存在');

    // Check: required/optional保留
    const hasRequired = formatted.includes('required');
    const hasOptional = formatted.includes('optional');
    if (!hasRequired || !hasOptional) {
        console.error('❌ qualifier丢失');
        return false;
    }
    console.log('✓ required/optional保留');

    // Check: 类型保留
    const hasUserId = formatted.includes('UserId');
    const hasString = formatted.includes('string');
    const hasI32 = formatted.includes('i32');
    if (!hasUserId || !hasString || !hasI32) {
        console.error('❌ 类型丢失');
        return false;
    }
    console.log('✓ 所有类型保留');

    // Check: 字段名保留
    const hasId = formatted.includes('id');
    const hasName = formatted.includes('name');
    const hasAge = formatted.includes('age');
    if (!hasId || !hasName || !hasAge) {
        console.error('❌ 字段名丢失');
        return false;
    }
    console.log('✓ 所有字段名保留');

    return true;
}

console.log('========================================');
console.log('测试: Struct 字段格式化修复');
console.log('========================================\n');

const result = testStructFieldFormatting();

console.log('\n========================================');
if (result) {
    console.log('✅ 测试通过!');
    process.exit(0);
} else {
    console.log('❌ 测试失败');
    process.exit(1);
}
