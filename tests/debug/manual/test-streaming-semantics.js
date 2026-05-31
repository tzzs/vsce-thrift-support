const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('Running streaming semantics tests...');

// 创建测试文件
const testContent = `
namespace js StreamingTest

struct Message {
  1: string content,
  2: i64 timestamp
}

struct LogEntry {
  1: string level,
  2: string message,
  3: i64 timestamp
}

struct RawMetric {
  1: string name,
  2: double value,
  3: map<string, string> tags
}

struct Metric {
  1: string name,
  2: double value,
  3: map<string, string> labels
}

service StreamService {
  // 单向流：客户端到服务器
  stream<i32> uploadData(1: string sessionId)
  
  // 单向流：服务器到客户端
  stream<string> downloadLogs(1: i32 count)
  
  // 双向流
  stream<Message> chat(1: stream<Message> messages)
}

service DataSinkService {
  // Sink接收器
  sink<LogEntry> collectLogs(1: string category)
  
  // Sink与stream结合
  sink<Metric> processMetrics(1: stream<RawMetric> input)
}
`;

const testFile = path.join(__dirname, 'test-streaming.thrift');
fs.writeFileSync(testFile, testContent);

// 运行诊断测试
const extensionPath = path.join(__dirname, '..');

// 直接测试正则表达式匹配
const testLines = [
  '  stream<i32> uploadData(1: string sessionId)',
  '  stream<string> downloadLogs(1: i32 count)', 
  '  stream<Message> chat(1: stream<Message> messages)',
  '  sink<LogEntry> collectLogs(1: string category)',
  '  sink<Metric> processMetrics(1: stream<RawMetric> input)',
  '  oneway void simpleMethod(1: string param)',
  '  i32 normalMethod(1: string param)',
  '  ResultType complexMethod(1: Request req) throws (1: Error err)'
];

console.log('Testing streaming syntax regex patterns...');

// 新的支持stream/sink的正则表达式
const streamingRegex = /^\s*(oneway\s+)?([A-Za-z_][A-Za-z0-9_]*(?:\s*<[^>]+>)?)\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)(\s*throws\s*\(([^)]*)\))?/;
// 旧的正则表达式
const oldRegex = /^\s*(oneway\s+)?([A-Za-z_][A-Za-z0-9_]*)\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)(\s*throws\s*\(([^)]*)\))?/;

testLines.forEach(line => {
  console.log(`\nTesting: ${line}`);
  
  const streamingMatch = line.match(streamingRegex);
  const oldMatch = line.match(oldRegex);
  
  console.log(`  Streaming regex match: ${!!streamingMatch}`);
  if (streamingMatch) {
    console.log(`    Return type: "${streamingMatch[2]}"`);
    console.log(`    Method name: "${streamingMatch[3]}"`);
  }
  
  console.log(`  Old regex match: ${!!oldMatch}`);
  if (oldMatch) {
    console.log(`    Return type: "${oldMatch[2]}"`);
    console.log(`    Method name: "${oldMatch[3]}"`);
  }
});

// 验证关键区别
const streamLine = '  stream<Message> chat(1: stream<Message> messages)';
const streamMatch = streamLine.match(streamingRegex);
const oldStreamMatch = streamLine.match(oldRegex);

console.log('\n=== Critical Test: stream<Message> parsing ===');
console.log(`Line: ${streamLine}`);
console.log(`Streaming regex: ${!!streamMatch} (return type: "${streamMatch?.[2] || 'none'}")`);
console.log(`Old regex: ${!!oldStreamMatch} (return type: "${oldStreamMatch?.[2] || 'none'}")`);

if (streamMatch && streamMatch[2] === 'stream<Message>') {
  console.log('✅ Streaming syntax parsing works correctly!');
} else {
  console.log('❌ Streaming syntax parsing failed');
  process.exit(1);
}
  
console.log('Streaming semantics tests completed successfully!');