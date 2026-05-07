const fs = require('fs');

// 读取测试文件
const content = fs.readFileSync('test-files/thrift_full_coverage.thrift', 'utf8');
const lines = content.split('\n');

// 检查用户提到的具体行
const testLines = [
  { line: 84, content: lines[83], description: 'Service方法定义开始' },
  { line: 85, content: lines[84], description: 'void ping(),' },
  { line: 88, content: lines[87], description: 'string echo(...) throws (...),' },
  { line: 91, content: lines[90], description: 'oneway void notify(...)' },
  { line: 106, content: lines[105], description: 'stream<i64> fetchLargeData(...),' },
  { line: 109, content: lines[108], description: 'sink<string, i32> uploadChunks(...),' },
  { line: 128, content: lines[127], description: '字段注解 (accessor = "getField", json_name = "f")' },
  { line: 147, content: lines[146], description: 'map<string, map<string, i32>> trickyMap' }
];

console.log('=== 用户提到的具体语法高亮问题验证 ===\n');

testLines.forEach(test => {
  console.log(`Line ${test.line}: ${test.description}`);
  console.log(`内容: ${test.content}`);
  
  // 检查关键字匹配
  const keywords = /\b(void|string|oneway|stream|sink|map|list|set|accessor|json_name)\b/g;
  const matches = test.content.match(keywords) || [];
  
  console.log(`匹配到的关键字: [${matches.join(', ')}]`);
  
  // 检查是否有未匹配的关键字
  const expectedKeywords = [];
  if (test.content.includes('void')) expectedKeywords.push('void');
  if (test.content.includes('string')) expectedKeywords.push('string');
  if (test.content.includes('oneway')) expectedKeywords.push('oneway');
  if (test.content.includes('stream')) expectedKeywords.push('stream');
  if (test.content.includes('sink')) expectedKeywords.push('sink');
  if (test.content.includes('map')) expectedKeywords.push('map');
  if (test.content.includes('list')) expectedKeywords.push('list');
  if (test.content.includes('set')) expectedKeywords.push('set');
  if (test.content.includes('accessor')) expectedKeywords.push('accessor');
  if (test.content.includes('json_name')) expectedKeywords.push('json_name');
  
  const missing = expectedKeywords.filter(k => !matches.includes(k));
  const found = expectedKeywords.filter(k => matches.includes(k));
  
  if (missing.length === 0) {
    console.log('✓ 所有期望关键字都已匹配');
  } else {
    console.log(`✗ 缺少匹配: [${missing.join(', ')}]`);
  }
  
  if (found.length > 0) {
    console.log(`✓ 成功匹配: [${found.join(', ')}]`);
  }
  
  console.log('');
});