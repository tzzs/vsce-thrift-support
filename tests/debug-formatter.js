const fs = require('fs');
const path = require('path');

// 模拟VSCode的格式化选项
const mockOptions = {
    insertSpaces: true,
    tabSize: 2,
    indentSize: 2,
    alignTypes: true,
    alignFieldNames: true,
    alignComments: true,
    trailingComma: true
};

// 读取编译后的格式化器
const FormatterModule = require('./out/formatter.js');
const ThriftFormattingProvider = FormatterModule.ThriftFormattingProvider;

// 创建格式化器实例
const formatter = new ThriftFormattingProvider();

// 测试用的Thrift代码
const testCode = `struct User {
  1: required UserId     id,
  2: required string name,
  3: optional Email email,
  4: optional i32 age,
  5: optional Status status = Status.ACTIVE,
  6: optional list<string> tags,
  7: optional map<string, string> metadata,
  8: optional bool isVerified = false,
  9: optional double score = 0.0,
  10: optional binary avatar
}`;

console.log('=== 原始代码 ===');
console.log(testCode);
console.log('\n=== 开始格式化测试 ===');

try {
    // 调用私有方法进行测试
    const result = formatter.formatThriftCode(testCode, mockOptions);
    console.log('\n=== 格式化结果 ===');
    console.log(result);
    
    // 检查是否有变化
    if (result === testCode) {
        console.log('\n❌ 格式化没有产生任何变化');
    } else {
        console.log('\n✅ 格式化成功，代码已改变');
    }
} catch (error) {
    console.error('\n❌ 格式化过程中出现错误:', error);
}

// 测试各个方法
console.log('\n=== 测试各个方法 ===');

// 测试isStructStart
const structLine = 'struct User {';
console.log(`isStructStart('${structLine}'):`, formatter.isStructStart(structLine));

// 测试isStructField
const fieldLines = [
    '  1: required UserId     id,',
    '  2: required string name,',
    '  3: optional Email email,'
];

fieldLines.forEach(line => {
    console.log(`isStructField('${line}'):`, formatter.isStructField(line));
});

// 测试parseStructField
fieldLines.forEach(line => {
    const result = formatter.parseStructField(line);
    console.log(`parseStructField('${line}'):`, result);
});