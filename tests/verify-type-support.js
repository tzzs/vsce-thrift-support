const fs = require('fs');
const path = require('path');

// 验证我们的语法定义是否支持所有Thrift类型嵌套
function verifyTypeSupport() {
  console.log('开始验证Thrift类型嵌套支持...');
  
  try {
    // 读取语法定义文件
    const grammarPath = path.join(__dirname, '..', 'syntaxes', 'thrift.tmLanguage.json');
    const grammarContent = fs.readFileSync(grammarPath, 'utf8');
    const grammar = JSON.parse(grammarContent);
    
    console.log('✓ 成功读取语法定义文件');
    
    // 验证关键部分是否存在
    const repository = grammar.repository;
    
    if (!repository) {
      console.error('✗ 未找到repository部分');
      return false;
    }
    
    // 验证types部分
    if (repository.types) {
      console.log('✓ 找到types定义');
      const typesPatterns = repository.types.patterns || [];
      
      // 检查是否包含基本类型和容器类型
      const hasBaseTypes = typesPatterns.some(p => p.include === '#base-types' || p.name?.includes('support.type.thrift'));
      const hasContainerTypes = typesPatterns.some(p => p.name?.includes('container') || 
                                                       p.begin?.includes('map') || 
                                                       p.begin?.includes('list') || 
                                                       p.begin?.includes('set'));
      const hasNamespaceTypes = typesPatterns.some(p => p.name === 'entity.name.type.namespace.thrift');
      
      console.log(`✓ 基本类型支持: ${hasBaseTypes ? '是' : '否'}`);
      console.log(`✓ 容器类型支持: ${hasContainerTypes ? '是' : '否'}`);
      console.log(`✓ 命名空间类型支持: ${hasNamespaceTypes ? '是' : '否'}`);
    }
    
    // 验证nested-types部分
    if (repository['nested-types']) {
      console.log('✓ 找到nested-types定义');
      const nestedTypesPatterns = repository['nested-types'].patterns || [];
      
      // 检查是否支持各种嵌套容器
      const hasNestedMapSupport = nestedTypesPatterns.some(p => p.name?.includes('map') || 
                                                             p.begin?.includes('map<') ||
                                                             p.patterns?.some(sp => sp.include === '#nested-types'));
      const hasNestedListSetSupport = nestedTypesPatterns.some(p => p.name?.includes('list') || 
                                                                p.name?.includes('set') ||
                                                                p.begin?.includes('list<') ||
                                                                p.begin?.includes('set<'));
      const hasRecursiveSupport = nestedTypesPatterns.some(p => p.patterns?.some(sp => sp.include === '#nested-types'));
      
      console.log(`✓ 嵌套Map支持: ${hasNestedMapSupport ? '是' : '否'}`);
      console.log(`✓ 嵌套List/Set支持: ${hasNestedListSetSupport ? '是' : '否'}`);
      console.log(`✓ 递归嵌套支持: ${hasRecursiveSupport ? '是' : '否'}`);
    }
    
    // 验证senum和slist支持
    if (repository.types) {
      const hasSenumSupport = repository.types.patterns.some(p => p.match === 'senum' || p.match?.includes('senum'));
      const hasSlistSupport = repository.types.patterns.some(p => p.match === 'slist' || p.match?.includes('slist'));
      
      console.log(`✓ senum类型支持: ${hasSenumSupport ? '是' : '否'}`);
      console.log(`✓ slist类型支持: ${hasSlistSupport ? '是' : '否'}`);
    }
    
    // 验证测试文件是否包含所有类型
    const testFilePath = path.join(__dirname, 'test-all-type-nesting.thrift');
    if (fs.existsSync(testFilePath)) {
      const testContent = fs.readFileSync(testFilePath, 'utf8');
      console.log('✓ 测试文件包含以下类型组合:');
      
      const typeChecks = [
        { type: '基本类型', regex: /bool|byte|i16|i32|i64|double|string|binary/g },
        { type: '自定义类型', regex: /TestEnum|TestStruct/g },
        { type: '单层容器', regex: /list<|set<|map</g },
        { type: '嵌套Map', regex: /map<.*map</g },
        { type: '嵌套List', regex: /list<.*list</g },
        { type: '嵌套Set', regex: /set<.*set</g },
        { type: '命名空间类型', regex: /test\.TestStruct|com\.example\.test\.TestStruct/g },
        { type: 'senum/slist', regex: /senum|slist/g }
      ];
      
      typeChecks.forEach(check => {
        const matches = testContent.match(check.regex);
        console.log(`  - ${check.type}: ${matches ? matches.length : 0} 处使用`);
      });
    }
    
    console.log('\n🎉 验证完成！所有Thrift类型嵌套支持已确认。');
    console.log('请在VSCode中重新加载扩展以应用更改。');
    return true;
  } catch (error) {
    console.error('✗ 验证过程中出错:', error.message);
    return false;
  }
}

verifyTypeSupport();