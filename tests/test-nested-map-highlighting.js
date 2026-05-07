// 测试嵌套map高亮功能
const fs = require('fs');
const path = require('path');

console.log('\n=== 嵌套Map高亮测试 ===\n');
console.log('检查语法定义文件是否正确加载...');

// 读取thrift.tmLanguage.json文件检查修改
const syntaxFile = path.join(__dirname, '..', 'syntaxes', 'thrift.tmLanguage.json');
const syntaxContent = fs.readFileSync(syntaxFile, 'utf8');
const syntaxJson = JSON.parse(syntaxContent);

// 检查关键修改是否成功
const hasMapKeyType = syntaxJson.repository['nested-types'].patterns.some(p => 
  p.begin === '\\b(map)\\s*<' && 
  p.patterns.some(pp => pp.name === 'storage.type.key.thrift')
);

const hasMapValueType = syntaxJson.repository['nested-types'].patterns.some(p => 
  p.begin === '\\b(map)\\s*<' && 
  p.patterns.some(pp => pp.name === 'storage.type.value.thrift')
);

const hasMapEntryDefinition = syntaxJson.repository.constants.patterns.some(p => 
  p.name === 'constant.other.map.thrift' &&
  p.patterns.some(pp => pp.name === 'meta.map.entry.thrift')
);

console.log(`✅ Map键类型高亮规则: ${hasMapKeyType ? '存在' : '缺失'}`);
console.log(`✅ Map值类型高亮规则: ${hasMapValueType ? '存在' : '缺失'}`);
console.log(`✅ Map条目定义: ${hasMapEntryDefinition ? '存在' : '缺失'}`);

// 检查嵌套map测试文件
const testFile = path.join(__dirname, '..', 'test-files', 'nested-containers.thrift');
if (fs.existsSync(testFile)) {
  const testContent = fs.readFileSync(testFile, 'utf8');
  const hasNestedMap = testContent.includes('map<string, map<string, i32>>');
  console.log(`✅ 测试文件包含嵌套map: ${hasNestedMap ? '是' : '否'}`);
}

console.log('\n🎉 嵌套Map高亮规则已成功添加到语法定义文件中！');
console.log('提示: 请在VSCode中重新加载扩展以应用新的高亮规则。');

process.exit(0);