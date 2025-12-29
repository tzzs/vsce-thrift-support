const fs = require('fs');
const path = require('path');

// Import the formatter
const {ThriftFormatter} = require('../../../out/thrift-formatter.js');

/**
 * 专门测试服务中文档注释的缩进
 * 文档注释应该使用2空格缩进，与方法同级
 */
function testServiceDocComments() {
    const filePath = path.join(__dirname, '..', '..', 'test-files/example.thrift');
    const content = fs.readFileSync(filePath, 'utf8');

    // Format the content first
    const formatter = new ThriftFormatter();
    const options = {
        insertSpaces: true,
        indentSize: 2
    };

    const formattedContent = formatter.format(content, options);

    const lines = formattedContent.split('\n');
    let inUserService = false;
    let serviceBraceCount = 0;
    let errors = [];

    console.log('=== 测试服务中文档注释缩进 ===\n');

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineNum = i + 1;

        // 检测进入UserService
        if (line.includes('service UserService')) {
            inUserService = true;
            serviceBraceCount = 0;
            continue;
        }

        if (inUserService) {
            // 计算大括号来跟踪服务范围
            if (line.includes('{')) serviceBraceCount++;
            if (line.includes('}')) {
                serviceBraceCount--;
                if (serviceBraceCount === 0) {
                    inUserService = false;
                    continue;
                }
            }

            // 检查文档注释行
            const trimmed = line.trim();
            if (trimmed.startsWith('/**') || trimmed.startsWith('*') || trimmed.startsWith('*/')) {
                const match = line.match(/^(\s*)/);
                const indent = match ? match[1].length : 0;

                console.log(`行 ${lineNum}: "${line}"`);
                console.log(`  文档注释缩进: ${indent} 空格`);

                // 文档注释的对齐规则：
                // - 起始行 /** 使用2空格缩进
                // - 内容行 * 使用3空格缩进（与/**中的*对齐）
                // - 结束行 */ 使用3空格缩进（与内容行对齐）
                let expectedIndent = 2;
                if (trimmed.startsWith('*') && !trimmed.startsWith('/**')) {
                    expectedIndent = 3; // 内容行和结束行使用3空格
                }

                if (indent !== expectedIndent) {
                    console.log(`  ❌ 错误: 文档注释应该使用${expectedIndent}空格缩进，实际为${indent}空格`);
                    errors.push({
                        line: lineNum,
                        expected: expectedIndent,
                        actual: indent,
                        content: line
                    });
                } else {
                    console.log(`  ✅ 正确: 文档注释缩进符合标准`);
                }
                console.log('');
            }
        }
    }

    if (errors.length > 0) {
        console.log(`\n发现 ${errors.length} 个文档注释缩进错误:`);
        errors.forEach(error => {
            console.log(`  行 ${error.line}: 期望${error.expected}空格，实际${error.actual}空格`);
        });
        return false;
    } else {
        console.log('\n✅ 所有文档注释缩进都符合标准（2空格起始行，3空格内容/结束行）');
        return true;
    }
}

if (require.main === module) {
    const success = testServiceDocComments();
    process.exit(success ? 0 : 1);
}

module.exports = {testServiceDocComments};