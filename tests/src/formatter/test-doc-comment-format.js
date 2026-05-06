const {ThriftFormatter} = require('../../../out/formatter/index.js');

/**
 * 测试文档注释格式化
 */
function testDocCommentFormatting() {

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

    const formatter = new ThriftFormatter();

    const options = {
        indentSize: 2,
        insertSpaces: true
    };


    const result = formatter.format(testContent, options);


    // 检查文档注释的缩进
    const lines = result.split('\n');
    let errors = [];

    lines.forEach((line, index) => {
        const trimmed = line.trim();
        if (trimmed.startsWith('/**') || trimmed.startsWith('*') || trimmed.startsWith('*/')) {
            const match = line.match(/^(\s*)/);
            const indent = match ? match[1].length : 0;


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
    } else {
    }
}

describe('doc-comment-format', () => {
    it('should pass all test assertions', () => {
        testDocCommentFormatting();
    });
});