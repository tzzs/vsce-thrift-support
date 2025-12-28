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
                            case 'alignTypes': return true;
                            case 'alignFieldNames': return true;
                            case 'trailingComma': return 'add';
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

const input = `service UserService{User getUser(1:i32 id);void createUser(1:User user);}`;

console.log('输入:');
console.log(input);

const result = formatter.format(input, {
    indentSize: 4,
    insertSpaces: true,
    alignTypes: true,
    alignNames: true,
    trailingComma: 'add'
});

console.log('\n实际输出:');
console.log(result);

console.log('\n期望输出:');
console.log(`service UserService {
    User getUser(1: i32 id)
    void createUser(1: User user)
}`);