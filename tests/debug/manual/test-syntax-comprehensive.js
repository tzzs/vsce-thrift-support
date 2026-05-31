const fs = require('fs');

// 读取语法文件
const grammar = JSON.parse(fs.readFileSync('syntaxes/thrift.tmLanguage.json', 'utf8'));

// 测试用例 - 包含用户提到的具体问题
const testCases = [
  // 基本关键字 - 用户提到的行84-91
  { line: '  void ping(),', expected: ['void'], location: 'Line 85' },
  { line: '  string echo(1:string msg) throws (1: DetailedError err),', expected: ['string', 'string'], location: 'Line 88' },
  { line: '  oneway void notify(1:string topic, 2:string message)', expected: ['oneway', 'void'], location: 'Line 91' },
  
  // stream和sink关键字 - 用户提到的行106, 109
  { line: '  stream<i64> fetchLargeData(1: string query),', expected: ['stream', 'i64'], location: 'Line 106' },
  { line: '  sink<string, i32> uploadChunks(1: list<string> chunks),', expected: ['sink', 'string', 'i32'], location: 'Line 109' },
  
  // 字段注解 - 用户提到的行128
  { line: '  1: string field (accessor = "getField", json_name = "f")', expected: ['string', 'accessor', 'json_name'], location: 'Line 128' },
  
  // 复杂map类型 - 用户提到的行147
  { line: '  4: map<string, map<string, i32>> trickyMap = {"outer": {"inner": 1}},', expected: ['map', 'string', 'map', 'string', 'i32'], location: 'Line 147' },
  
  // 额外测试用例
  { line: '  list<string> chunks', expected: ['list', 'string'], location: 'Extra test' },
  { line: '  map<string, list<i32>> complex', expected: ['map', 'string', 'list', 'i32'], location: 'Extra test' }
];

console.log('=== 语法高亮问题详细分析 ===\n');

// 检查nested-types模式是否存在
if (grammar.repository['nested-types']) {
  console.log('✓ nested-types模式已定义');
} else {
  console.log('✗ nested-types模式未定义');
}

// 检查annotation关键字模式
if (grammar.repository.annotations.patterns[0].patterns.find(p => p.name === 'keyword.other.annotation.thrift')) {
  console.log('✓ annotation关键字模式已定义');
} else {
  console.log('✗ annotation关键字模式未定义');
}

// 测试每个用例
testCases.forEach((testCase, index) => {
  console.log(`\n测试 ${index + 1} (${testCase.location}): ${testCase.line}`);
  console.log(`期望匹配: [${testCase.expected.join(', ')}]`);
  
  // 检查关键字匹配
  const keywordRegex = /\b(include|namespace|typedef|struct|union|exception|enum|service|const|required|optional|throws|extends|void|bool|byte|i8|i16|i32|i64|double|string|binary|uuid|map|list|set|oneway|async|reference|stream|sink|interaction|performs)\b/g;
  const annotationRegex = /\b(accessor|json_name|cpp\.name|java\.name|py\.name)\b/g;
  const basicTypeRegex = /\b(void|bool|byte|i8|i16|i32|i64|double|string|binary|uuid)\b/g;
  const containerRegex = /\b(map|list|set)\b/g;
  
  const keywordMatches = testCase.line.match(keywordRegex) || [];
  const annotationMatches = testCase.line.match(annotationRegex) || [];
  const basicTypeMatches = testCase.line.match(basicTypeRegex) || [];
  const containerMatches = testCase.line.match(containerRegex) || [];
  
  console.log(`关键字匹配: [${keywordMatches.join(', ')}]`);
  console.log(`注解关键字匹配: [${annotationMatches.join(', ')}]`);
  console.log(`基本类型匹配: [${basicTypeMatches.join(', ')}]`);
  console.log(`容器类型匹配: [${containerMatches.join(', ')}]`);
  
  // 验证期望匹配
  const allMatches = [...new Set([...keywordMatches, ...annotationMatches, ...basicTypeMatches, ...containerMatches])];
  const missing = testCase.expected.filter(expected => !allMatches.includes(expected));
  const extra = allMatches.filter(match => !testCase.expected.includes(match));
  
  if (missing.length === 0) {
    console.log('✓ 所有期望匹配已找到');
  } else {
    console.log(`✗ 缺少匹配: [${missing.join(', ')}]`);
  }
  
  if (extra.length > 0) {
    console.log(`注意: 额外匹配: [${extra.join(', ')}]`);
  }
});