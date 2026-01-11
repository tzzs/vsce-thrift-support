const fs = require('fs');
const assert = require('assert');

const {ThriftFormatter} = require('../../../out/formatter/index.js');

describe('format-core-debug', () => {
    async function formatContent(content, options = {}) {
        const formatter = new ThriftFormatter();
        return formatter.format(content, options);
    }

    it('基本结构体格式化', async () => {
        const input = `struct User{1:i32 id;2:string name;}`;
        const expected = `struct User {
	1: i32 id
	2: string name
}`;
        const result = await formatContent(input);
        assert.strictEqual(result.trim(), expected.trim());
    });

    it('柚举格式化', async () => {
        const input = `enum Status{ACTIVE=1;INACTIVE=2;PENDING=3}`;
        const expected = `enum Status {
	ACTIVE = 1
	INACTIVE = 2
	PENDING = 3
}`;
        const result = await formatContent(input);
        assert.strictEqual(result.trim(), expected.trim());
    });

    it('服务方法格式化', async () => {
        const input = `service UserService{User getUser(1:i32 id);void createUser(1:User user);}`;
        const expected = `service UserService {
	User getUser(1:i32 id)
	void createUser(1:User user)
}`;
        const result = await formatContent(input);
        assert.strictEqual(result.trim(), expected.trim());
    });

    it('注释格式化', async () => {
        const input = `struct User{1:i32 id;2:string name;}`;
        const expected = `struct User {
	1: i32 id
	2: string name
}`;
        const result = await formatContent(input);
        assert.strictEqual(result.trim(), expected.trim());
    });

    it('复杂服务方法参数缩进', async () => {
        const input = `service TestService {
  TestResponse testMethod(1: string param1, 2: i32 param2, 3: list<string> param3)
}`;
        const expected = `service TestService {
	TestResponse testMethod(1: string param1, 2: i32 param2, 3: list<string> param3)
}`;
        const result = await formatContent(input);
        assert.strictEqual(result.trim(), expected.trim());
    });

    it('2空格缩进格式化', async () => {
        const input = `struct User{1:i32 id;2:string name;}`;
        const expected = `struct User {
	1: i32 id
	2: string name
}`;
        const result = await formatContent(input, {indentSize: 2});
        assert.strictEqual(result.trim(), expected.trim());
    });

    it('文件格式化读写', async () => {
        const input = `struct TestStruct{1:i32 id;2:string name;}`;
        const expected = `struct TestStruct {
	1: i32 id
	2: string name
}`;
        const result = await formatContent(input);
        assert.strictEqual(result.trim(), expected.trim());
    });

    it('对齐选项组合测试', async () => {
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
        assert.strictEqual(result.trim(), expected.trim());
    });
});