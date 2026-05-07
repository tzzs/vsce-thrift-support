const { ThriftFormattingProvider } = require('../out/formattingProvider');

function testVariableNameAlignment() {
    console.log('测试变量名对齐修复...');

    const formatter = new ThriftFormattingProvider();
    
    // 创建一个包含各种字段类型的测试用例
    const testInput = `struct User {
  1: required UserId id, // 用户唯一标识
  2: required string name (go.tag='json:"name"'), // 用户姓名
  3: optional Email email (go.tag="xx:\"len($)>0\""), // 邮箱地址
  4: optional i32 age, // 年龄
  5: optional Status status = Status.ACTIVE, // 用户状态
  6: optional list<string> tags, // 用户标签列表
  7: optional map<string, string> metadata, // 用户元数据
  8: optional bool isVerified = false, // 是否已验证
  9: optional double score = 0.0, // 用户评分
  10: optional binary avatar, // 用户头像数据
}`;

    console.log('输入:');
    console.log(testInput);
    console.log('');

    // 格式化选项，启用所有对齐功能
    const options = {
        insertSpaces: true,
        tabSize: 4,
        alignTypes: true,
        alignFieldNames: true,  // 启用变量名对齐
        alignAnnotations: true,
        alignComments: true,
        trailingComma: 'preserve',
        alignStructDefaults: false
    };

    try {
        // 调用格式化方法
        const formattedResult = formatter.formatThriftCode(testInput, {
            ...options,
            alignTypes: true,
            alignFieldNames: true,
            alignStructDefaults: false,
            alignAnnotations: true,
            alignComments: true,
            alignEnumNames: true,
            alignEnumEquals: true,
            alignEnumValues: true,
            indentSize: 4,
            maxLineLength: 100,
            collectionStyle: 'preserve',
            insertSpaces: true,
            tabSize: 4,
            initialContext: undefined
        });
        
        console.log('输出 (启用对齐):');
        console.log(formattedResult);
        console.log('');

        // 检查变量名是否正确对齐
        const lines = formattedResult.split('\n');
        const structLines = lines.filter(line => 
            line.trim().startsWith('1:') || 
            line.trim().startsWith('2:') || 
            line.trim().startsWith('3:') || 
            line.trim().startsWith('4:') || 
            line.trim().startsWith('5:') || 
            line.trim().startsWith('6:') || 
            line.trim().startsWith('7:') || 
            line.trim().startsWith('8:') || 
            line.trim().startsWith('9:') || 
            line.trim().startsWith('10:')
        );
        
        console.log('检查字段对齐位置:');
        structLines.forEach((line, index) => {
            // 找到字段名的起始位置
            // 通常在 "fieldId: qualifier type " 之后
            // 我们查找字段名的位置来验证对齐
            const fieldMatch = line.match(/\d+:\s+(required|optional)?\s*(\w+)\s+(\w+)/);
            if (fieldMatch) {
                const fieldName = fieldMatch[3]; // 字段名是第3个捕获组
                const fieldNameIndex = line.indexOf(fieldName);
                console.log(`  第${index+1}行: '${fieldName}' 位置 ${fieldNameIndex}`);
                
                // 检查字段名是否大致对齐在同一列
                // 由于格式化器使用了对齐，这些位置应该比较接近
            }
        });

        // 验证对齐的准确性
        console.log('\n验证变量名对齐:');
        const namePositions = [];
        structLines.forEach(line => {
            const fieldMatch = line.match(/\d+:\s+(required|optional)?\s*(\w+)\s+(\w+)/);
            if (fieldMatch) {
                const fieldName = fieldMatch[3];
                const fieldNameIndex = line.indexOf(fieldName);
                namePositions.push({ fieldName, position: fieldNameIndex });
            }
        });

        if (namePositions.length >= 2) {
            const firstPosition = namePositions[0].position;
            let allAligned = true;
            for (let i = 1; i < namePositions.length; i++) {
                const diff = Math.abs(namePositions[i].position - firstPosition);
                if (diff > 1) { // 允许1个字符的微小差异
                    allAligned = false;
                    console.log(`  错误: ${namePositions[i].fieldName} 未正确对齐 (位置差: ${diff})`);
                }
            }
            
            if (allAligned) {
                console.log('  ✓ 所有变量名都已正确对齐');
            } else {
                console.log('  ✗ 变量名对齐存在问题');
            }
        } else {
            console.log('  无法验证对齐: 找不到足够的字段');
        }

        // 测试不使用对齐的情况
        console.log('\n测试不启用对齐的情况:');
        const optionsNoAlignment = { 
            ...options,
            alignFieldNames: false, // 禁用变量名对齐
            alignTypes: false,
            alignAnnotations: false,
            alignComments: false
        };

        const formattedResult2 = formatter.formatThriftCode(testInput, {
            ...optionsNoAlignment,
            alignTypes: false,
            alignFieldNames: false,
            alignStructDefaults: false,
            alignAnnotations: false,
            alignComments: false,
            alignEnumNames: false,
            alignEnumEquals: false,
            alignEnumValues: false,
            indentSize: 4,
            maxLineLength: 100,
            collectionStyle: 'preserve',
            insertSpaces: true,
            tabSize: 4,
            initialContext: undefined
        });
        
        console.log('输出 (禁用对齐):');
        console.log(formattedResult2);

        console.log('\n测试完成!');
        return formattedResult;

    } catch (error) {
        console.error('格式化出错:', error);
        console.error(error.stack);
        return null;
    }
}

// 运行测试
testVariableNameAlignment();