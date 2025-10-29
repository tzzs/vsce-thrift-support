const fs = require('fs');
const path = require('path');

// 加载语法文件
const grammarPath = path.join(__dirname, '..', 'syntaxes', 'thrift.tmLanguage.json');
const grammar = JSON.parse(fs.readFileSync(grammarPath, 'utf8'));

// 测试typedef中嵌套类型是否正确解析
function testTypedefNestedTypes() {
  console.log('测试typedef中嵌套类型修复...');
  
  // 检查typedef-definitions是否存在
  if (!grammar.repository['typedef-definitions']) {
    console.error('✗ 缺少typedef-definitions仓库部分');
    process.exit(1);
  }
  
  // 检查typedef-definitions是否有正确的patterns引用
  const typedefDefinition = grammar.repository['typedef-definitions'].patterns[0] || {};
  const typedefPatterns = typedefDefinition.patterns || [];
  const hasTypesInclude = typedefPatterns.some(pattern => 
    pattern.include === '#types' || pattern.include === '#nested-types'
  );
  
  if (!hasTypesInclude) {
    console.error('✗ typedef-definitions缺少对#types或#nested-types的引用');
    process.exit(1);
  }
  
  console.log('✓ typedef-definitions结构正确');
  
  // 检查nested-types是否存在
  if (!grammar.repository['nested-types']) {
    console.error('✗ 缺少nested-types仓库部分');
    process.exit(1);
  }
  
  console.log('✓ nested-types仓库部分存在');
  
  // 检查具体的嵌套类型正则表达式
  const nestedTypesPatterns = grammar.repository['nested-types'].patterns || [];
  let hasValidPattern = false;
  
  for (const pattern of nestedTypesPatterns) {
    if (pattern.begin && pattern.begin.includes('<') && pattern.end && pattern.end.includes('>')) {
      hasValidPattern = true;
      break;
    }
  }
  
  if (!hasValidPattern) {
    console.error('✗ nested-types缺少有效的嵌套类型匹配模式');
    process.exit(1);
  }
  
  console.log('✓ nested-types包含有效的嵌套类型匹配模式');
  
  // 检查operators模式是否正确配置
  const operatorsPattern = grammar.repository.operators.patterns[0];
  if (!operatorsPattern.match || operatorsPattern.match.includes('$$')) {
    console.error('✗ operators模式包含错误的$$符号');
    process.exit(1);
  }
  
  console.log('✓ operators模式配置正确');
  
  // 读取测试文件
  const testFilePath = path.join(__dirname, '..', 'test-files', 'nested-containers.thrift');
  const testFileContent = fs.readFileSync(testFilePath, 'utf8');
  
  // 测试复杂嵌套类型的typedef
  const complexTypedefs = [
    'typedef list<map<string, i32>> NestedList',
    'typedef list<list<map<string, i32>>> DeepType',
    'typedef set<map<string, list<i64>>> ComplexType',
    'typedef set<list<map<i32, set<string>>>> VeryComplexType',
    'typedef list<map<string, i32>> (python.immutable = "") AnnotatedNested'
  ];
  
  console.log('\n测试复杂嵌套类型的typedef...');
  complexTypedefs.forEach((typedef, index) => {
    if (testFileContent.includes(typedef)) {
      console.log(`✓ ${index + 1}. 找到: ${typedef}`);
    } else {
      console.log(`✗ ${index + 1}. 未找到: ${typedef}`);
    }
  });
  
  // 重点测试有问题的嵌套类型
  console.log('\n重点测试有问题的嵌套类型...');
  const problematicType = 'set<list<map<i32, set<string>>>>';
  if (testFileContent.includes(problematicType)) {
    console.log(`✓ 找到问题类型: ${problematicType}`);
    // 验证嵌套层级是否正确
    const bracketDepth = countBracketDepth(problematicType);
    console.log(`  嵌套层级: ${bracketDepth}`);
    
    // 验证逗号处理
    const commasInNesting = countCommasInNested(problematicType);
    console.log(`  嵌套中的逗号数量: ${commasInNesting}`);
  }
}

// 计算括号嵌套深度
function countBracketDepth(text) {
  let maxDepth = 0;
  let currentDepth = 0;
  
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '<') {
      currentDepth++;
      maxDepth = Math.max(maxDepth, currentDepth);
    } else if (text[i] === '>') {
      currentDepth--;
    }
  }
  
  return maxDepth;
}

// 计算嵌套结构中的逗号数量
function countCommasInNested(text) {
  let commas = 0;
  let inNested = false;
  let depth = 0;
  
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '<') {
      depth++;
      inNested = true;
    } else if (text[i] === '>') {
      depth--;
      if (depth === 0) {
        inNested = false;
      }
    } else if (text[i] === ',' && inNested) {
      commas++;
    }
  }
  
  return commas;
}

// 执行测试
testTypedefNestedTypes();
console.log('\n所有测试完成！');