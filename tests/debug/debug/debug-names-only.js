// Mock VSCode API
const {createVscodeMock, installVscodeMock} = require('../../mock_vscode.js');
const vscode = createVscodeMock({
    TextEdit: {replace: (range, text) => ({range, newText: text})},
    Range: class {
        constructor(start, end) {
            this.start = start;
            this.end = end;
        }
    },
    Position: class {
        constructor(line, character) {
            this.line = line;
            this.character = character;
        }
    },
    workspace: {
        getConfiguration: (section) => {
            if (section === 'thrift.format') {
                return {
                    get: (key, def) => {
                        switch (key) {
                            case 'alignTypes': return false; // 关键：不对齐类型
                            case 'alignFieldNames': return true; // 关键：对齐字段名
                            case 'trailingComma': return 'preserve';
                            case 'indentSize': return 4;
                            case 'insertSpaces': return true;
                            default: return def;
                        }
                    }
                };
            }
            return {
                get: (key, def) => def,
            };
        }
    }
});
installVscodeMock(vscode);


// Mock Module to load our formatter
const { ThriftFormatter } = require('../out/thriftFormatter');

// 创建格式化器
const formatter = new ThriftFormatter();

const input = `struct MixedConfig {
1: i32 port = 8080;
2: string host;
3: bool enabled = true;
4: list<string> tags;
}`;

// 仅名称对齐，不对齐类型
const resultNamesOnly = formatter.format(input, {
    indentSize: 4,
    insertSpaces: true,
    alignTypes: false,
    alignNames: true,
    trailingComma: 'preserve'
});

console.log('仅名称对齐，不对齐类型:');
console.log(resultNamesOnly);
console.log('\n预期格式:');
console.log(`struct MixedConfig {
\t1: i32 port     = 8080;
\t2: string host;
\t3: bool enabled = true;
\t4: list<string> tags;
}`);