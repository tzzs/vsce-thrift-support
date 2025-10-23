const fs = require('fs');

// 读取语法文件
const grammar = JSON.parse(fs.readFileSync('syntaxes/thrift.tmLanguage.json', 'utf8'));

// 测试用例
const testCases = [
  // 基本关键字
  { line: 'void ping(),', expected: ['void'] },
  { line: 'string echo(1:string msg)', expected: ['string', 'string'] },
  { line: 'oneway void notify()', expected: ['oneway', 'void'] },
  
  // 流式类型
  { line: 'stream<i64> fetchLargeData()', expected: ['stream', 'i64'] },
  { line: 'sink<string, i32> uploadChunks()', expected: ['sink', 'string', 'i32'] },
  
  // 复杂容器类型
  { line: 'map<string, map<string, i32>> trickyMap', expected: ['map', 'string', 'map', 'string', 'i32'] },
  { line: 'list<string> chunks', expected: ['list', 'string'] },
  
  // 字段注解
  { line: 'string field (accessor = "getField")', expected: ['string', 'accessor'] }
];

console.log('=== 语法高亮问题分析 ===\n');

// 检查关键字模式
const keywordPatterns = grammar.repository.keywords.patterns;
console.log('关键字模式:');
keywordPatterns.forEach((pattern, i) => {
  console.log(`  ${i + 1}. ${pattern.name}: ${pattern.match}`);
});

// 检查类型模式
const typePatterns = grammar.repository.types.patterns;
console.log('\n类型模式:');
typePatterns.forEach((pattern, i) => {
  console.log(`  ${i + 1}. ${pattern.name}: ${pattern.match}`);
});

// 测试每个用例
console.log('\n=== 测试用例分析 ===');
testCases.forEach((testCase, index) => {
  console.log(`\n测试 ${index + 1}: ${testCase.line}`);
  console.log(`期望匹配: [${testCase.expected.join(', ')}]`);
  
  // 检查关键字匹配
  const keywordRegex = new RegExp(keywordPatterns[0].match.replace(/\\b/g, ''), 'g');
  const typeRegex = new RegExp(typePatterns[0].match.replace(/\\b/g, ''), 'g');
  const containerRegex = new RegExp(typePatterns[1].match.replace(/\\b/g, ''), 'g');
  
  const keywordMatches = testCase.line.match(keywordRegex) || [];
  const typeMatches = testCase.line.match(typeRegex) || [];
  const containerMatches = testCase.line.match(containerRegex) || [];
  
  console.log(`关键字匹配: [${keywordMatches.join(', ')}]`);
  console.log(`基本类型匹配: [${typeMatches.join(', ')}]`);
  console.log(`容器类型匹配: [${containerMatches.join(', ')}]`);
});