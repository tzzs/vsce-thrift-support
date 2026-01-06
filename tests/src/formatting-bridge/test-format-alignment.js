// 对齐格式化专项测试 - 合并了 test-const-alignment.js, test-struct-defaults-alignment.js 等对齐相关测试
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
        getConfiguration: (_section) => ({get: (_key, def) => def}),
    }
});
installVscodeMock(vscode);


// Mock require('vscode') inside formatter
const {ThriftFormatter} = require('../../../out/formatter/index.js');

function run() {
    console.log('\n=== 运行对齐格式化专项测试 ===');
    
    let passedTests = 0;
    let totalTests = 0;
    
    function test(name, fn) {
        totalTests++;
        try {
            fn();
            console.log(`✓ ${name}`);
            passedTests++;
        } catch (error) {
            console.log(`✗ ${name}: ${error.message}`);
        }
    }
    
    function assertFormatted(input, expected, options = {}) {
        const formatter = new ThriftFormatter();
        const formatted = formatter.format(input, {
            indentSize: 4,
            alignTypes: true,
            alignNames: true,
            alignAssignments: true,
            alignStructDefaults: true,
            alignAnnotations: true,
            alignComments: true,
            maxLineLength: 100,
            trailingComma: 'preserve',
            collectionStyle: 'preserve',
            ...options
        });
        assert.strictEqual(formatted.trim(), expected.trim(), '格式化结果不匹配');
    }
    
    // 测试1: 结构体字段对齐
    test('结构体字段对齐', () => {
        const input = `struct UserConfig {
1: i32 port;
2: string hostname;
3: bool enableFeature;
4: list<string> tags;
}`;
        
        const expected = `struct UserConfig {
	1: i32          port;
	2: string       hostname;
	3: bool         enableFeature;
	4: list<string> tags;
}`;
        
        assertFormatted(input, expected);
    });
    
    // 测试2: 常量对齐
    test('常量对齐', () => {
        const input = `const i32 MAX_PORT = 65535;
const string DEFAULT_HOST = "localhost";
const bool ENABLE_CACHE = true;
const double TIMEOUT = 30.5;`;
        
        const expected = `const i32    MAX_PORT     = 65535;
const string DEFAULT_HOST = "localhost";
const bool   ENABLE_CACHE = true;
const double TIMEOUT      = 30.5;`;
        
        assertFormatted(input, expected);
    });
    
    // 测试3: 枚举值对齐
    test('枚举值对齐', () => {
        const input = `enum ErrorCode {
SUCCESS = 0,
INVALID_INPUT = 100,
AUTHENTICATION_FAILED = 200,
SERVER_ERROR = 500
}`;
        
        const expected = `enum ErrorCode {
	SUCCESS = 0,
	INVALID_INPUT = 100,
	AUTHENTICATION_FAILED = 200,
	SERVER_ERROR = 500
}`;
        
        assertFormatted(input, expected);
    });
    
    // 测试4: 结构体默认值对齐
    test('结构体默认值对齐', () => {
        const input = `struct Config {
1: i32 port = 8080;
2: string host = "localhost";
3: bool enabled = true;
4: i32 timeout = 30;
}`;
        
        const expected = `struct Config {
	1: i32    port = 8080;
	2: string host = "localhost";
	3: bool   enabled = true;
	4: i32    timeout = 30;
}`;
        
        assertFormatted(input, expected, { alignStructDefaults: true });
    });
    
    // 测试5: 注释对齐
    test('注释对齐', () => {
        const input = `struct User {
1: i32 id; // 用户ID
2: string name; // 用户名
3: bool active; // 是否激活
}`;
        
        const expected = `struct User {
	1: i32    id;     // 用户ID
	2: string name;   // 用户名
	3: bool   active; // 是否激活
}`;
        
        assertFormatted(input, expected);
    });
    
    // 测试6: 注解对齐
    test('注解对齐', () => {
        const input = `struct User {
1: i32 id (api.query = "id");
2: string name (api.body = "name", validate.required = true);
3: bool active (api.query = "active");
}`;
        
        const expected = `struct User {
	1: i32    id;     (api.query = "id")
	2: string name;   (api.body = "name", validate.required = true)
	3: bool   active; (api.query = "active")
}`;
        
        assertFormatted(input, expected);
    });
    
    // 测试7: 服务方法参数对齐
    test('服务方法参数对齐', () => {
        const input = `service UserService {
User createUser(1: string username, 2: string email, 3: i32 age);
User getUserById(1: i32 userId);
list<User> searchUsers(1: string query, 2: i32 limit, 3: i32 offset);
}`;
        
        const expected = `service UserService {
	User createUser(1: string username, 2: string email, 3: i32 age);
	User getUserById(1: i32 userId);
	list<User> searchUsers(1: string query, 2: i32 limit, 3: i32 offset);
}`;
        
        assertFormatted(input, expected);
    });
    
    // 测试8: 混合对齐选项测试
    test('混合对齐选项测试', () => {
        const input = `struct MixedConfig {
1: i32 port = 8080;
2: string host;
3: bool enabled = true;
4: list<string> tags;
}`;
        
        // 仅类型对齐，不对齐名称
        const expectedTypesOnly = `struct MixedConfig {
	1: i32          port = 8080;
	2: string       host;
	3: bool         enabled = true;
	4: list<string> tags;
}`;
        
        assertFormatted(input, expectedTypesOnly, { alignNames: false });
        
        // 仅名称对齐，不对齐类型
        const expectedNamesOnly = `struct MixedConfig {
	1: i32 port = 8080;
	2: string host;
	3: bool enabled = true;
	4: list<string> tags;
}`;
        
        assertFormatted(input, expectedNamesOnly, { alignTypes: false });
    });
    
    // 测试9: 长行对齐测试
    test('长行对齐测试', () => {
        const input = `struct LongLineConfig {
1: map<string, list<map<string, i32>>> complexMapping;
2: VeryLongTypeName veryLongFieldName;
3: short s;
}`;
        
        const expected = `struct LongLineConfig {
	1: map<string,list<map<string,i32>>> complexMapping;
	2: VeryLongTypeName                  veryLongFieldName;
	3: short                             s;
}`;
        
        assertFormatted(input, expected);
    });
    
    console.log(`\n=== 测试结果: ${passedTests}/${totalTests} 测试通过 ===`);
    
    Module._load = originalLoad;
    
    if (passedTests === totalTests) {
        console.log('✓ 所有对齐测试通过!');
        return true;
    } else {
        console.log(`✗ ${totalTests - passedTests} 个测试失败`);
        return false;
    }
}

if (require.main === module) {
    const success = run();
    process.exit(success ? 0 : 1);
}

module.exports = { run };
