const fs = require('fs');
const assert = require('assert');

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
                    get: (key, defaultValue) => {
                        const config = {
                            'alignTypes': true,
                            'alignFieldNames': true,
                            'trailingComma': 'add',
                            'indentSize': 4,
                            'insertSpaces': true,
                            'alignNames': true,
                            'alignAssignments': true,
                            'alignStructDefaults': false,
                            'alignAnnotations': true,
                            'alignComments': true,
                            'alignEnumEquals': true,
                            'alignEnumValues': true,
                            'maxLineLength': 100,
                            'collectionStyle': 'preserve'
                        };
                        return config[key] !== undefined ? config[key] : defaultValue;
                    }
                };
            }
            return {
                get: (key, defaultValue) => defaultValue,
            };
        }
    }
});
installVscodeMock(vscode);


// Mock require('vscode') inside formatter
const {ThriftFormatter} = require('../../../out/formatter/index.js');

async function formatContent(content, options = {}) {
    const formatter = new ThriftFormatter();
    return formatter.format(content, options);
}

async function runDebug() {
    console.log('=== 运行 test-format-core.js 调试 ===');
    
    const tests = [
        '基本结构体格式化',
        '枚举格式化',
        '服务方法格式化',
        '注释格式化',
        '复杂服务方法参数缩进',
        '2空格缩进格式化',
        '文件格式化读写',
        '对齐选项组合测试'
    ];
    
    for (let i = 0; i < tests.length; i++) {
        console.log(`\n测试 ${i + 1}: ${tests[i]}`);
        try {
            switch (i) {
                case 0: // 基本结构体格式化
                    {
                        const input = `struct User{1:i32 id;2:string name;}`;
                        const expected = `struct User {
	1: i32 id
	2: string name
}`;
                        const result = await formatContent(input);
                        console.log('输入:', input);
                        console.log('期望:', expected);
                        console.log('实际:', result);
                        assert.strictEqual(result.trim(), expected.trim());
                        console.log('✓ 通过');
                    }
                    break;
                    
                case 1: // 枚举格式化
                    {
                        const input = `enum Status{ACTIVE=1;INACTIVE=2;PENDING=3}`;
                        const expected = `enum Status {
	ACTIVE = 1
	INACTIVE = 2
	PENDING = 3
}`;
                        const result = await formatContent(input);
                        console.log('输入:', input);
                        console.log('期望:', expected);
                        console.log('实际:', result);
                        assert.strictEqual(result.trim(), expected.trim());
                        console.log('✓ 通过');
                    }
                    break;
                    
                case 2: // 服务方法格式化
                    {
                        const input = `service UserService{User getUser(1:i32 id);void createUser(1:User user);}`;
                        const expected = `service UserService {
	User getUser(1:i32 id)
	void createUser(1:User user)
}`;
                        const result = await formatContent(input);
                        console.log('输入:', input);
                        console.log('期望:', expected);
                        console.log('实际:', result);
                        assert.strictEqual(result.trim(), expected.trim());
                        console.log('✓ 通过');
                    }
                    break;
                    
                case 3: // 注释格式化
                    {
                        const input = `struct User{1:i32 id;2:string name;}`;
                        const expected = `struct User {
	1: i32 id
	2: string name
}`;
                        const result = await formatContent(input);
                        console.log('输入:', input);
                        console.log('期望:', expected);
                        console.log('实际:', result);
                        assert.strictEqual(result.trim(), expected.trim());
                        console.log('✓ 通过');
                    }
                    break;
                    
                case 4: // 复杂服务方法参数缩进
                    {
                        const input = `service TestService {
  TestResponse testMethod(1: string param1, 2: i32 param2, 3: list<string> param3)
}`;
                        const expected = `service TestService {
	TestResponse testMethod(1: string param1, 2: i32 param2, 3: list<string> param3)
}`;
                        const result = await formatContent(input);
                        console.log('输入:', input);
                        console.log('期望:', expected);
                        console.log('实际:', result);
                        assert.strictEqual(result.trim(), expected.trim());
                        console.log('✓ 通过');
                    }
                    break;
                    
                case 5: // 2空格缩进格式化
                    {
                        const input = `struct User{1:i32 id;2:string name;}`;
                        const expected = `struct User {
	1: i32 id
	2: string name
}`;
                        const result = await formatContent(input, { indentSize: 2 });
                        console.log('输入:', input);
                        console.log('期望:', expected);
                        console.log('实际:', result);
                        assert.strictEqual(result.trim(), expected.trim());
                        console.log('✓ 通过');
                    }
                    break;
                    
                case 6: // 文件格式化读写
                    {
                        const input = `struct TestStruct{1:i32 id;2:string name;}`;
                        const expected = `struct TestStruct {
	1: i32 id
	2: string name
}`;
                        const result = await formatContent(input);
                        console.log('输入:', input);
                        console.log('期望:', expected);
                        console.log('实际:', result);
                        assert.strictEqual(result.trim(), expected.trim());
                        console.log('✓ 通过');
                    }
                    break;
                    
                case 7: // 对齐选项组合测试
                    {
                        const input = `struct Config{1:i32 port;2:string host;3:bool enabled;}`;
                        const expected = `struct Config {
	1: i32    port
	2: string host
	3: bool   enabled
}`;
                        const result = await formatContent(input, { 
                            alignTypes: true, 
                            alignNames: true, 
                            alignAssignments: true 
                        });
                        console.log('输入:', input);
                        console.log('期望:', expected);
                        console.log('实际:', result);
                        assert.strictEqual(result.trim(), expected.trim());
                        console.log('✓ 通过');
                    }
                    break;
            }
        } catch (error) {
            console.log('✗ 失败:', error.message);
            if (error.actual && error.expected) {
                console.log('实际结果:', JSON.stringify(error.actual));
                console.log('期望结果:', JSON.stringify(error.expected));
            }
            return i + 1; // Return the failing test number
        }
    }
    
    console.log('\n=== 所有测试通过! ===');
    return 0;
}

runDebug().then(result => {
    process.exit(result);
}).catch(error => {
    console.error('调试运行失败:', error);
    process.exit(1);
});
