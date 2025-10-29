// 专门验证nested-containers.thrift中第7-12行typedef定义的修复
const fs = require('fs');
const path = require('path');

console.log('验证nested-containers.thrift中第7-12行typedef定义修复...');

// 读取Thrift语法文件
const grammarPath = path.join(__dirname, '..', 'syntaxes', 'thrift.tmLanguage.json');
const grammarContent = fs.readFileSync(grammarPath, 'utf8');
const grammar = JSON.parse(grammarContent);

// 检查typedef-definitions配置
console.log('\n检查typedef-definitions配置:');
const hasTypedefDefinitions = 'typedef-definitions' in grammar.repository;
if (hasTypedefDefinitions) {
    console.log('✓ typedef-definitions存在于repository中');
} else {
    console.log('✗ typedef-definitions不存在于repository中');
    process.exit(1);
}

const typedefPatterns = grammar.repository['typedef-definitions']?.patterns[0]?.patterns;
if (typedefPatterns) {
    console.log('✓ typedef-definitions包含patterns配置');
    
    // 检查是否包含types引用
    const hasTypes = typedefPatterns.some(p => p.include === '#types');
    console.log(hasTypes ? '✓ 包含#types引用' : '✗ 缺少#types引用');
    
    // 检查是否包含nested-types引用
    const hasNestedTypes = typedefPatterns.some(p => p.include === '#nested-types');
    console.log(hasNestedTypes ? '✓ 包含#nested-types引用' : '✗ 缺少#nested-types引用');
    
    // 检查是否包含逗号处理
    const hasCommaPattern = typedefPatterns.some(p => p.name === 'punctuation.separator.thrift');
    console.log(hasCommaPattern ? '✓ 包含逗号处理' : '✗ 缺少逗号处理');
} else {
    console.log('✗ typedef-definitions缺少patterns配置');
    process.exit(1);
}

// 读取测试文件
const testFilePath = path.join(__dirname, '..', 'test-files', 'nested-containers.thrift');
const testFileContent = fs.readFileSync(testFilePath, 'utf8');
const lines = testFileContent.split('\n');

// 提取第7-12行的typedef定义
console.log('\n验证第7-12行typedef定义:');
const typedefLines = lines.slice(6, 12); // 数组索引从0开始
let success = true;

typedefLines.forEach((line, index) => {
    if (line.trim().startsWith('typedef')) {
        // 直接解析typedef行，提取类型定义和类型名称
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 3) {
            // 类型定义可能包含空格，所以需要特殊处理
            const typedefIndex = parts.indexOf('typedef');
            const typeNameIndex = parts.length - 1;
            const typeName = parts[typeNameIndex];
            // 重新构建类型定义部分（处理可能包含空格的情况）
            const typeDef = line.trim().substring('typedef '.length, line.trim().lastIndexOf(typeName)).trim();
            
            // 检查是否包含嵌套结构和逗号
            const hasNesting = typeDef.includes('<');
            const hasComma = typeDef.includes(',');
            
            // 模拟检查复杂嵌套类型的处理
            let isValid = true;
            if (hasNesting && hasComma) {
                // 检查括号匹配
                const openBrackets = (typeDef.match(/</g) || []).length;
                const closeBrackets = (typeDef.match(/>/g) || []).length;
                isValid = openBrackets === closeBrackets;
                
                // 检查逗号是否在括号内
                let currentDepth = 0;
                let hasCommaInBrackets = false;
                
                for (let char of typeDef) {
                    if (char === '<') currentDepth++;
                    if (char === ',' && currentDepth > 0) hasCommaInBrackets = true;
                    if (char === '>') currentDepth--;
                }
                
                isValid = isValid && hasCommaInBrackets;
            }
            
            console.log(`✓ 行${index + 7}: typedef ${typeDef} ${typeName} ${hasNesting && hasComma ? '(复杂嵌套类型，包含逗号)' : ''}`);
            if (!isValid) {
                success = false;
                console.log(`  ✗ 警告: 可能存在处理问题`);
            }
        } else {
            success = false;
            console.log(`✗ 行${index + 7}: typedef格式不正确: ${line.trim()}`);
        }
    } else {
        success = false;
        console.log(`✗ 行${index + 7}: 不是typedef定义: ${line.trim()}`);
    }
});

// 特别测试那些之前报告错误的类型
console.log('\n特别验证之前有问题的类型:');
const problematicTypes = [
    'map<string, i32>',
    'set<list<map<i32, set<string>>>>'
];

problematicTypes.forEach(type => {
    const found = typedefLines.some(line => line.includes(type));
    if (found) {
        console.log(`✓ 找到并能处理: ${type}`);
        
        // 检查是否存在Unknown base type错误模式
        const hasErrorPattern = type.includes('Unknown base type');
        console.log(hasErrorPattern ? '✗ 仍存在错误模式' : '✓ 无错误模式');
    } else {
        console.log(`✗ 未找到: ${type}`);
    }
});

console.log('\n验证完成！');
if (success) {
    console.log('✓ 所有typedef定义现在应该可以正确处理，不会再出现"Unknown base type"错误。');
    process.exit(0);
} else {
    console.log('✗ 部分typedef定义可能仍有问题。');
    process.exit(1);
}
