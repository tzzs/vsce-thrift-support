const fs = require('fs');
const path = require('path');

// 各种数据类型
const dataTypes = [
  'bool', 'byte', 'i16', 'i32', 'i64', 'double', 'string', 'binary'
];

// 集合类型
const collectionTypes = [
  'list', 'set', 'map'
];

// 生成随机字符串
function randomString(length) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// 生成随机注释
function generateComment() {
  const comments = [
    `// This is a ${randomString(5)} field`,
    `/** ${randomString(10)} description */`,
    `/// ${randomString(8)} documentation`,
    `// TODO: ${randomString(6)} implementation`,
    `/* Multi-line\n   ${randomString(7)} comment */`
  ];
  return comments[Math.floor(Math.random() * comments.length)];
}

// 生成基本类型字段
function generateBasicField(index) {
  const type = dataTypes[Math.floor(Math.random() * dataTypes.length)];
  const fieldName = `field_${randomString(5).toLowerCase()}_${index}`;
  const fieldId = Math.floor(Math.random() * 100) + 1;
  const required = Math.random() > 0.5 ? 'required' : 'optional';
  const comment = Math.random() > 0.3 ? generateComment() + '\n  ' : '';
  
  return `${comment}${fieldId}: ${required} ${type} ${fieldName}`;
}

// 生成集合类型字段
function generateCollectionField(index) {
  const collection = collectionTypes[Math.floor(Math.random() * collectionTypes.length)];
  const type = dataTypes[Math.floor(Math.random() * dataTypes.length)];
  const fieldName = `collection_${randomString(5).toLowerCase()}_${index}`;
  const fieldId = Math.floor(Math.random() * 100) + 1;
  const comment = Math.random() > 0.3 ? generateComment() + '\n  ' : '';
  
  let collectionType;
  switch (collection) {
    case 'list':
      collectionType = `list<${type}>`;
      break;
    case 'set':
      collectionType = `set<${type}>`;
      break;
    case 'map':
      const keyType = dataTypes[Math.floor(Math.random() * dataTypes.length)];
      collectionType = `map<${keyType}, ${type}>`;
      break;
  }
  
  return `${comment}${fieldId}: optional ${collectionType} ${fieldName}`;
}

// 生成结构体
function generateStruct(structName, fieldCount) {
  let fields = [];
  for (let i = 1; i <= fieldCount; i++) {
    if (Math.random() > 0.7) {
      fields.push(generateCollectionField(i));
    } else {
      fields.push(generateBasicField(i));
    }
  }
  
  return `struct ${structName} {
  ${fields.join(';\n  ')};
}`;
}

// 生成枚举
function generateEnum(enumName) {
  const values = [];
  const count = Math.floor(Math.random() * 8) + 3;
  
  for (let i = 0; i < count; i++) {
    const valueName = `${randomString(4).toUpperCase()}_${i}`;
    const comment = Math.random() > 0.5 ? ' ' + generateComment() : '';
    values.push(`  ${valueName} = ${i * 10}${comment}`);
  }
  
  return `enum ${enumName} {\n${values.join(',\n')}\n}`;
}

// 生成异常
function generateException(exceptionName, fieldCount) {
  let fields = [];
  for (let i = 1; i <= fieldCount; i++) {
    fields.push(generateBasicField(i));
  }
  
  return `exception ${exceptionName} {
  ${fields.join(';\n  ')};
}`;
}

// 生成服务
function generateService(serviceName, structNames, enumNames) {
  const methods = [];
  const methodCount = Math.floor(Math.random() * 6) + 2;
  
  for (let i = 0; i < methodCount; i++) {
    const methodName = `${randomString(6).toLowerCase()}Method${i}`;
    const returnType = Math.random() > 0.3 ? structNames[Math.floor(Math.random() * structNames.length)] : 'void';
    
    const paramCount = Math.floor(Math.random() * 4) + 1;
    const params = [];
    for (let j = 0; j < paramCount; j++) {
      const paramType = Math.random() > 0.5 ? 
        structNames[Math.floor(Math.random() * structNames.length)] :
        dataTypes[Math.floor(Math.random() * dataTypes.length)];
      params.push(`${paramType} param${j}`);
    }
    
    const exceptions = [];
    if (Math.random() > 0.6) {
      exceptions.push(`throws (1: ${randomString(5)}Exception e)`);
    }
    
    methods.push(`  ${returnType} ${methodName}(${params.join(', ')})${exceptions.length > 0 ? ' ' + exceptions[0] : ''}`);
  }
  
  return `service ${serviceName} {
${methods.join(';\n')}\n}`;
}

// 生成完整的thrift文件内容
function generateThriftFile(fileIndex) {
  const fileName = `test_${String(fileIndex).padStart(3, '0')}.thrift`;
  
  // 命名空间
  const namespaces = [];
  const namespaceTypes = ['cpp', 'java', 'py', 'go', 'js', 'csharp', 'php'];
  for (let i = 0; i < Math.floor(Math.random() * 4) + 1; i++) {
    const nsType = namespaceTypes[Math.floor(Math.random() * namespaceTypes.length)];
    const nsName = `${randomString(5).toLowerCase()}.test${fileIndex}`;
    namespaces.push(`namespace ${nsType} ${nsName}`);
  }
  
  // 包含文件
  const includes = [];
  if (fileIndex > 0 && Math.random() > 0.3) {
    const includeCount = Math.floor(Math.random() * 3) + 1;
    for (let i = 0; i < includeCount; i++) {
      const includeFile = `test_${String(Math.floor(Math.random() * fileIndex)).padStart(3, '0')}.thrift`;
      includes.push(`include "${includeFile}"`);
    }
  }
  
  // 生成各种定义
  const definitions = [];
  
  // 常量
  if (Math.random() > 0.7) {
    const constName = `${randomString(6).toUpperCase()}_CONST`;
    const constValue = Math.floor(Math.random() * 1000);
    definitions.push(`const i32 ${constName} = ${constValue}`);
  }
  
  // 类型定义
  const typedefCount = Math.floor(Math.random() * 3);
  for (let i = 0; i < typedefCount; i++) {
    const typeName = `${randomString(6)}Type${i}`;
    const baseType = dataTypes[Math.floor(Math.random() * dataTypes.length)];
    definitions.push(`typedef ${baseType} ${typeName}`);
  }
  
  // 结构体
  const structNames = [];
  const structCount = Math.floor(Math.random() * 5) + 2;
  for (let i = 0; i < structCount; i++) {
    const structName = `${randomString(8)}Struct${i}`;
    structNames.push(structName);
    const fieldCount = Math.floor(Math.random() * 15) + 5;
    definitions.push(generateStruct(structName, fieldCount));
  }
  
  // 枚举
  const enumNames = [];
  const enumCount = Math.floor(Math.random() * 3) + 1;
  for (let i = 0; i < enumCount; i++) {
    const enumName = `${randomString(6)}Enum${i}`;
    enumNames.push(enumName);
    definitions.push(generateEnum(enumName));
  }
  
  // 异常
  const exceptionCount = Math.floor(Math.random() * 3);
  for (let i = 0; i < exceptionCount; i++) {
    const exceptionName = `${randomString(8)}Exception${i}`;
    const fieldCount = Math.floor(Math.random() * 8) + 2;
    definitions.push(generateException(exceptionName, fieldCount));
  }
  
  // 服务
  if (Math.random() > 0.4) {
    const serviceName = `${randomString(8)}Service`;
    definitions.push(generateService(serviceName, structNames, enumNames));
  }
  
  // 组合最终内容
  let content = '';
  
  // 文件头注释
  content += `/**
 * Test Thrift File ${fileIndex}
 * Generated for performance testing
 * Contains various data types, references, and styles
 */
\n`;
  
  // 命名空间
  if (namespaces.length > 0) {
    content += namespaces.join('\n') + '\n\n';
  }
  
  // 包含文件
  if (includes.length > 0) {
    content += includes.join('\n') + '\n\n';
  }
  
  // 定义
  content += definitions.join('\n\n');
  
  return { fileName, content };
}

// 生成所有测试文件
function generateTestFiles() {
  const testDir = path.join(__dirname, 'test-thrift');
  
  // 确保目录存在
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir);
  }
  
  console.log('Generating 100 test thrift files...');
  
  for (let i = 0; i < 100; i++) {
    const { fileName, content } = generateThriftFile(i);
    const filePath = path.join(testDir, fileName);
    
    fs.writeFileSync(filePath, content);
    
    if ((i + 1) % 10 === 0) {
      console.log(`Generated ${i + 1}/100 files...`);
    }
  }
  
  console.log('All test files generated successfully!');
  console.log(`Files location: ${testDir}`);
}

// 运行生成
if (require.main === module) {
  generateTestFiles();
}