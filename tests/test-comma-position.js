// Mock vscode module
const vscode = {
    Position: class Position {
        constructor(line, character) {
            this.line = line;
            this.character = character;
        }
    },
    Range: class Range {
        constructor(start, end) {
            this.start = start;
            this.end = end;
        }
    },
    workspace: {
        getConfiguration: (section) => {
            const config = {
                'thrift-support.formatting.trailingComma': global.testTrailingComma || 'preserve',
                'thrift-support.formatting.alignTypes': false,
                'thrift-support.formatting.alignFieldNames': false,
                'thrift-support.formatting.alignComments': false,
                'thrift-support.formatting.alignEnumNames': false,
                'thrift-support.formatting.alignEnumEquals': false,
                'thrift-support.formatting.alignEnumValues': false,
                'thrift-support.formatting.indentSize': 4
            };
            
            return {
                get: (key) => {
                    const fullKey = section ? `${section}.${key}` : key;
                    return config[fullKey] !== undefined ? config[fullKey] : null;
                }
            };
        }
    },
    TextEdit: {
        replace: (range, newText) => {
            return { range, newText };
        }
    }
};

// Set up module mock before requiring formatter
const Module = require('module');
const originalRequire = Module.prototype.require;

Module.prototype.require = function(id) {
    if (id === 'vscode') {
        return vscode;
    }
    return originalRequire.apply(this, arguments);
};

// Import the formatter
const { ThriftFormattingProvider } = require('../out/formattingProvider.js');

// Restore original require
Module.prototype.require = originalRequire;

function createMockDocument(text) {
    const lines = text.split('\n');
    return {
        getText: () => text,
        lineAt: (line) => ({ text: lines[line] || '' }),
        positionAt: (offset) => {
            let currentOffset = 0;
            for (let i = 0; i < lines.length; i++) {
                const lineLength = lines[i].length + 1;
                if (currentOffset + lineLength > offset) {
                    return new vscode.Position(i, offset - currentOffset);
                }
                currentOffset += lineLength;
            }
            return new vscode.Position(lines.length - 1, lines[lines.length - 1]?.length || 0);
        }
    };
}

function checkCommaPosition() {
    console.log('========================================');
    console.log('检查: 格式化后逗号是否会移动到注释后面');
    console.log('========================================\n');
    
    const formatter = new ThriftFormattingProvider();
    
    let allTestsPassed = true;
    
    // 测试用例1: 结构体 - comma在注释前面
    console.log('【测试1】结构体 - 逗号应该保持在注释前面');
    const input1 = `struct User {
    1: string name, // User name
    2: i32 age, // User age
}`;
    const mockDoc1 = createMockDocument(input1);
    const result1 = formatter.provideDocumentFormattingEdits(mockDoc1, { insertSpaces: true, tabSize: 4 }, {});
    const output1 = result1[0].newText;
    console.log('输入:');
    console.log(input1);
    console.log('\n输出:');
    console.log(output1);
    
    const line1Ok = /name,\s*\/\//.test(output1);
    const line2Ok = /age,\s*\/\//.test(output1);
    const test1Passed = line1Ok && line2Ok;
    console.log(`\n结果: ${test1Passed ? '✓ PASS' : '✗ FAIL'}`);
    if (!test1Passed) allTestsPassed = false;
    console.log('');
    
    // 测试用例2: 枚举 - comma在注释前面
    console.log('【测试2】枚举 - 逗号应该保持在注释前面');
    const input2 = `enum Status {
    ACTIVE = 1, // Active status
    INACTIVE = 2, // Inactive status
}`;
    const mockDoc2 = createMockDocument(input2);
    const result2 = formatter.provideDocumentFormattingEdits(mockDoc2, { insertSpaces: true, tabSize: 4 }, {});
    const output2 = result2[0].newText;
    console.log('输入:');
    console.log(input2);
    console.log('\n输出:');
    console.log(output2);
    
    const enumLine1Ok = /1,\s*\/\//.test(output2);
    const enumLine2Ok = /2,\s*\/\//.test(output2);
    const test2Passed = enumLine1Ok && enumLine2Ok;
    console.log(`\n结果: ${test2Passed ? '✓ PASS' : '✗ FAIL'}`);
    if (!test2Passed) allTestsPassed = false;
    console.log('');
    
    // 测试用例3: 检查逗号是否不会出现在注释后面（这是历史问题）
    console.log('【测试3】验证逗号不会出现在注释后面');
    const hasCommaAfterComment1 = /\/\/.*,/.test(output1);
    const hasCommaAfterComment2 = /\/\/.*,/.test(output2);
    const test3Passed = !hasCommaAfterComment1 && !hasCommaAfterComment2;
    console.log(`结构体中逗号在注释后面: ${hasCommaAfterComment1 ? '是' : '否'}`);
    console.log(`枚举中逗号在注释后面: ${hasCommaAfterComment2 ? '是' : '否'}`);
    console.log(`结果: ${test3Passed ? '✓ PASS' : '✗ FAIL'}`);
    if (!test3Passed) allTestsPassed = false;
    console.log('');
    
    console.log('========================================');
    if (allTestsPassed) {
        console.log('✓ 所有测试通过！');
        console.log('结论: 格式化后逗号不会移动到注释后面');
    } else {
        console.log('✗ 部分测试失败');
        console.log('结论: 存在问题');
    }
    console.log('========================================');
    
    return allTestsPassed;
}

checkCommaPosition();
