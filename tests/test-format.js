const fs = require('fs');
const {ThriftFormatter} = require('../out/src/thriftFormatter.js');
const {ThriftParser} = require('../out/src/thriftParser.js');

// 读取测试文件
const content = fs.readFileSync('test-files/example.thrift', 'utf8');

// 创建解析器和格式化器
const parser = new ThriftParser();
const formatter = new ThriftFormatter(parser);

// 格式化内容
const formatted = formatter.format(content, {
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

// 写回文件
fs.writeFileSync('test-files/example.thrift', formatted);

console.log('文件已格式化完成');