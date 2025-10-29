const fs = require('fs');
const path = require('path');

// 读取语法定义文件
const syntaxFile = path.join(__dirname, '..', 'syntaxes', 'thrift.tmLanguage.json');
const syntaxContent = fs.readFileSync(syntaxFile, 'utf8');
const syntax = JSON.parse(syntaxContent);

// 读取测试文件
const testFile = path.join(__dirname, 'test-all-thrift-features.thrift');
const testContent = fs.readFileSync(testFile, 'utf8');

// 预期支持的Thrift语言元素
const expectedElements = {
  // 基本关键字
  keywords: [
    'include', 'cpp_include', 'namespace', 'typedef', 'struct', 'union', 
    'exception', 'enum', 'service', 'const', 'required', 'optional', 
    'throws', 'extends', 'void', 'bool', 'byte', 'i8', 'i16', 'i32', 
    'i64', 'double', 'string', 'binary', 'uuid', 'slist', 'senum', 
    'map', 'list', 'set', 'oneway', 'async', 'reference', 'stream', 'sink'
  ],
  
  // 存储修饰符
  modifiers: [
    'async', 'oneway', 'stream', 'sink', 'interaction', 'performs', 
    'reference', 'required', 'optional', 'readonly', 'final', 
    'transient', 'volatile', 'native'
  ],
  
  // 数据类型
  types: [
    'void', 'bool', 'byte', 'i8', 'i16', 'i32', 'i64', 
    'double', 'string', 'binary', 'uuid', 'slist', 'senum'
  ],
  
  // 容器类型
  containers: [
    'map', 'list', 'set'
  ],
  
  // 特殊类型
  specialTypes: [
    'stream', 'sink'
  ],
  
  // 命名空间修饰符
  namespaceModifiers: [
    'cpp', 'java', 'py', 'php', 'js', 'rb', 'csharp', 'go', 'swift'
  ]
};

// 检查语法定义中的模式
function checkPatternsForElement(element, patterns) {
  for (const pattern of patterns) {
    if (pattern.include) continue;
    
    if (pattern.match) {
      const match = new RegExp(pattern.match.replace(/\\/g, '')).toString();
      if (match.includes(element)) {
        return true;
      }
    }
    
    if (pattern.begin) {
      const begin = new RegExp(pattern.begin.replace(/\\/g, '')).toString();
      if (begin.includes(element)) {
        return true;
      }
    }
  }
  return false;
}

// 检查是否支持所有关键字
function checkKeywords() {
  console.log('=== 检查关键字支持 ===');
  const keywordsPatterns = syntax.repository.keywords.patterns;
  let supported = 0;
  let missing = [];
  
  for (const keyword of expectedElements.keywords) {
    const found = checkPatternsForElement(keyword, keywordsPatterns);
    if (found) {
      supported++;
    } else {
      missing.push(keyword);
    }
  }
  
  console.log(`支持的关键字: ${supported}/${expectedElements.keywords.length}`);
  if (missing.length > 0) {
    console.log(`缺少的关键字: ${missing.join(', ')}`);
  }
  
  return missing.length === 0;
}

// 检查是否支持所有修饰符
function checkModifiers() {
  console.log('\n=== 检查修饰符支持 ===');
  const modifiersPatterns = syntax.repository.keywords.patterns.find(p => 
    p.name === 'storage.modifier.thrift' 
  )?.patterns || [];
  
  const modifiersPattern = syntax.repository.keywords.patterns.find(p => 
    p.name === 'storage.modifier.thrift'
  );
  
  let supported = 0;
  let missing = [];
  
  for (const modifier of expectedElements.modifiers) {
    let found = false;
    if (modifiersPattern) {
      const match = new RegExp(modifiersPattern.match.replace(/\\/g, '')).toString();
      found = match.includes(modifier);
    }
    
    if (found) {
      supported++;
    } else {
      missing.push(modifier);
    }
  }
  
  console.log(`支持的修饰符: ${supported}/${expectedElements.modifiers.length}`);
  if (missing.length > 0) {
    console.log(`缺少的修饰符: ${missing.join(', ')}`);
  }
  
  return missing.length === 0;
}

// 检查是否支持所有类型
function checkTypes() {
  console.log('\n=== 检查类型支持 ===');
  const typesPatterns = syntax.repository.types.patterns;
  let supported = 0;
  let missing = [];
  
  for (const type of expectedElements.types) {
    const found = checkPatternsForElement(type, typesPatterns);
    if (found) {
      supported++;
    } else {
      missing.push(type);
    }
  }
  
  console.log(`支持的基本类型: ${supported}/${expectedElements.types.length}`);
  if (missing.length > 0) {
    console.log(`缺少的基本类型: ${missing.join(', ')}`);
  }
  
  return missing.length === 0;
}

// 检查是否支持所有容器类型
function checkContainers() {
  console.log('\n=== 检查容器类型支持 ===');
  const typesPatterns = syntax.repository.types.patterns;
  let supported = 0;
  let missing = [];
  
  for (const container of expectedElements.containers) {
    const found = checkPatternsForElement(container, typesPatterns);
    if (found) {
      supported++;
    } else {
      missing.push(container);
    }
  }
  
  console.log(`支持的容器类型: ${supported}/${expectedElements.containers.length}`);
  if (missing.length > 0) {
    console.log(`缺少的容器类型: ${missing.join(', ')}`);
  }
  
  return missing.length === 0;
}

// 检查嵌套类型支持
function checkNestedTypes() {
  console.log('\n=== 检查嵌套类型支持 ===');
  const nestedTypesPatterns = syntax.repository['nested-types'].patterns;
  
  const containerSupport = {};
  for (const container of expectedElements.containers) {
    containerSupport[container] = checkPatternsForElement(container, nestedTypesPatterns);
  }
  
  for (const specialType of expectedElements.specialTypes) {
    containerSupport[specialType] = checkPatternsForElement(specialType, nestedTypesPatterns);
  }
  
  console.log('嵌套类型支持情况:');
  let allSupported = true;
  for (const [type, supported] of Object.entries(containerSupport)) {
    console.log(`  ${type}: ${supported ? '是' : '否'}`);
    if (!supported) allSupported = false;
  }
  
  return allSupported;
}

// 检查是否支持所有语法结构
function checkSyntaxStructures() {
  console.log('\n=== 检查语法结构支持 ===');
  
  const requiredStructures = [
    'struct-definitions', 'service-definitions', 'enum-definitions',
    'exception-definitions', 'union-definitions', 'typedef-definitions'
  ];
  
  let supported = 0;
  let missing = [];
  
  for (const structure of requiredStructures) {
    if (syntax.repository[structure]) {
      supported++;
    } else {
      missing.push(structure);
    }
  }
  
  console.log(`支持的语法结构: ${supported}/${requiredStructures.length}`);
  if (missing.length > 0) {
    console.log(`缺少的语法结构: ${missing.join(', ')}`);
  }
  
  return missing.length === 0;
}

// 验证测试文件中的元素是否都能被识别
function validateTestFile() {
  console.log('\n=== 验证测试文件元素 ===');
  
  const testElements = {
    'include指令': /include\s+"[^"]+"/g,
    'cpp_include指令': /cpp_include\s+"[^"]+"/g,
    'namespace指令': /namespace\s+\w+\s+\S+/g,
    'typedef定义': /typedef\s+\w+\s+\w+/g,
    'struct定义': /struct\s+\w+\s*{/g,
    'service定义': /service\s+\w+\s*(?:extends\s+\w+\s*)?{/g,
    'enum定义': /enum\s+\w+\s*{/g,
    'exception定义': /exception\s+\w+\s*{/g,
    'union定义': /union\s+\w+\s*{/g,
    'const定义': /const\s+\w+\s+\w+\s*=/g,
    'required修饰符': /required\s+/g,
    'optional修饰符': /optional\s+/g,
    'oneway修饰符': /oneway\s+/g,
    'stream修饰符': /stream\s+/g,
    'sink修饰符': /sink\s+/g,
    'throws声明': /throws\s*\(/g,
    '字段定义': /\d+:\s*(?:required|optional)?\s*\w+\s+\w+/g,
    '方法定义': /\w+\s+\w+\s*\(/g,
    '嵌套容器': /list<|set<|map</g,
    '命名空间类型': /\w+\.\w+/g
  };
  
  let totalMatches = 0;
  console.log('测试文件中的元素匹配情况:');
  
  for (const [elementName, regex] of Object.entries(testElements)) {
    const matches = testContent.match(regex) || [];
    totalMatches += matches.length;
    console.log(`  ${elementName}: ${matches.length} 处匹配`);
  }
  
  console.log(`\n总共匹配到 ${totalMatches} 个元素`);
  return totalMatches > 0;
}

// 运行所有检查
function runAllChecks() {
  console.log('开始验证Thrift语法定义支持情况...\n');
  
  let allPassed = true;
  
  allPassed &= checkKeywords();
  allPassed &= checkModifiers();
  allPassed &= checkTypes();
  allPassed &= checkContainers();
  allPassed &= checkNestedTypes();
  allPassed &= checkSyntaxStructures();
  validateTestFile(); // 这个检查不计入总体结果
  
  console.log('\n=== 总结 ===');
  if (allPassed) {
    console.log('✅ 所有检查都通过了！语法定义支持所有必要的Thrift语言元素。');
  } else {
    console.log('❌ 部分检查未通过，请查看详细信息并修复语法定义。');
  }
}

// 执行验证
runAllChecks();