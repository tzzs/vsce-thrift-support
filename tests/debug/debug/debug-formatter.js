// 简单测试格式化器行为
const fs = require('fs');
const {ThriftFormatter} = require('../out/src/thriftFormatter.js');

console.log('=== 测试格式化器行为 ===');

const formatter = new ThriftFormatter();

const testCases = [
    {
        name: '简单结构体',
        input: 'struct User{1:i32 id;2:string name;}',
        description: '测试基础结构体格式化'
    },
    {
        name: '简单服务',
        input: 'service UserService{User getUser(1:i32 id);}',
        description: '测试基础服务格式化'
    },
    {
        name: '枚举',
        input: 'enum Status{ACTIVE=1;INACTIVE=2;}',
        description: '测试枚举格式化'
    }
];

testCases.forEach(testCase => {
    console.log(`\n--- ${testCase.name} ---`);
    console.log(`描述: ${testCase.description}`);
    console.log(`输入: ${testCase.input}`);
    
    try {
        const result = formatter.format(testCase.input, {
            indentSize: 4,
            alignTypes: true,
            alignNames: true,
            alignAssignments: true,
            alignStructDefaults: false,
            alignAnnotations: true,
            alignComments: true,
            maxLineLength: 100,
            trailingComma: 'preserve',
            collectionStyle: 'preserve'
        });
        
        console.log(`输出: ${JSON.stringify(result)}`);
        console.log(`格式化后:\n${result}`);
    } catch (error) {
        console.log(`错误: ${error.message}`);
    }
});
