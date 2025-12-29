const fs = require('fs');
const path = require('path');
const {ThriftFormatter} = require('../../../out/thrift-formatter.js');

/**
 * 测试服务中文档注释的缩进 - 格式化文件后检查
 */
function testServiceDocCommentsAfterFormat() {
    const filePath = path.join(__dirname, '..', '..', 'test-files/example.thrift');
    const content = fs.readFileSync(filePath, 'utf8');

    // 格式化文件内容
    const formatter = new ThriftFormatter();
    const options = {
        insertSpaces: true,
        indentSize: 2
    };

    console.log('=== 格式化前的内容 ===');
    const lines = content.split('\n');
    lines.forEach((line, i) => {
        if (line.includes('/**') || line.includes('*') || line.includes('*/')) {
            console.log(`${i + 1}: "${line}"`);
        }
    });

    const formatted = formatter.format(content, options);

    console.log('\n=== 格式化后的内容 ===');
    const formattedLines = formatted.split('\n');
    formattedLines.forEach((line, i) => {
        if (line.includes('/**') || line.includes('*') || line.includes('*/')) {
            console.log(`${i + 1}: "${line}"`);
        }
    });

    // 检查格式化后的结果
    let inUserService = false;
    let serviceBraceCount = 0;
    let errors = [];

    console.log('\n=== 检查格式化后的文档注释缩进 ===');

    for (let i = 0; i < formattedLines.length; i++) {
        const line = formattedLines[i];
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

                if (trimmed.startsWith('/**')) {
                    if (indent !== 2) {
                        console.log(`  ❌ 错误: 文档注释开始(/**)应该使用2空格缩进，实际为${indent}空格`);
                        errors.push({line: lineNum, expected: 2, actual: indent, content: line});
                    } else {
                        console.log(`  ✅ 正确: 文档注释开始缩进符合标准`);
                    }
                } else {
                    // Content lines (*) and closing lines (*/) should align with the asterisk of /**
                    // "  /**" -> indentation 2, asterisk at 3
                    // "   * " -> indentation 3
                    if (indent !== 3) {
                        console.log(`  ❌ 错误: 文档注释内容/结束应该使用3空格缩进(对齐*)，实际为${indent}空格`);
                        errors.push({line: lineNum, expected: 3, actual: indent, content: line});
                    } else {
                        console.log(`  ✅ 正确: 文档注释内容对齐正确 (3空格)`);
                    }
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
        console.log('\n✅ 所有文档注释缩进都符合标准（2空格）');
        return true;
    }
}

if (require.main === module) {
    const success = testServiceDocCommentsAfterFormat();
    process.exit(success ? 0 : 1);
}

module.exports = {testServiceDocCommentsAfterFormat};