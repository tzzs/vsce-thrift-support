const { ThriftFormatter } = require('./out/thriftFormatter');
const { ThriftParser } = require('./out/thriftParser');

/**
 * 测试文档注释格式化 - 增强调试版
 */
function testDocCommentFormatting() {
    console.log('=== 测试文档注释格式化（增强调试）===\n');
    
    const testContent = `service UserService {
/**
 * Create a new user
 */
  User createUser(1: User user),

/**
 * Get user by ID
 */
  User getUser(1: UserId userId)
}`;

    const parser = new ThriftParser();
    const formatter = new ThriftFormatter(parser);
    
    const options = {
        indentSize: 2,
        insertSpaces: true
    };
    
    console.log('原始内容:');
    const lines = testContent.split('\n');
    lines.forEach((line, i) => {
        console.log(`${i + 1}: "${line}"`);
    });
    console.log('\n' + '='.repeat(50) + '\n');
    
    const result = formatter.format(testContent, options);
    
    console.log('格式化结果:');
    const resultLines = result.split('\n');
    resultLines.forEach((line, i) => {
        console.log(`${i + 1}: "${line}"`);
    });
    
    // 检查文档注释的缩进
    let errors = [];
    
    resultLines.forEach((line, index) => {
        const trimmed = line.trim();
        if (trimmed.startsWith('/**') || trimmed.startsWith('*') || trimmed.startsWith('*/')) {
            const match = line.match(/^(\s*)/);
            const indent = match ? match[1].length : 0;
            
            console.log(`行 ${index + 1}: "${line}" -> 缩进: ${indent}`);
            
            if (trimmed.startsWith('/**') && indent !== 2) {
                errors.push(`行 ${index + 1}: /** 应该缩进2个空格，实际缩进${indent}个空格`);
            } else if (trimmed.startsWith('*') && !trimmed.startsWith('*/') && indent !== 3) {
                errors.push(`行 ${index + 1}: * 应该缩进3个空格，实际缩进${indent}个空格`);
            } else if (trimmed.startsWith('*/') && indent !== 2) {
                errors.push(`行 ${index + 1}: */ 应该缩进2个空格，实际缩进${indent}个空格`);
            }
        }
    });
    
    if (errors.length > 0) {
        console.log('\n❌ 发现错误:');
        errors.forEach(error => console.log(`  ${error}`));
    } else {
        console.log('\n✅ 所有文档注释缩进正确！');
    }
}

testDocCommentFormatting();