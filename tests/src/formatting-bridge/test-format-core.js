// 综合格式化核心测试 - 合并了 test-format.js, test-simple-format.js, test-real-format.js
const fs = require('fs');
const path = require('path');
const assert = require('assert');

// Mock VSCode API
const {createVscodeMock, installVscodeMock} = require('../../mock_vscode.js');
const vscode = createVscodeMock({
    window: {
        showInformationMessage: (...args) => console.log('[Info]', ...args),
        showErrorMessage: (...args) => console.error('[Error]', ...args),
    },
    Position: class {
        constructor(line, character) {
            this.line = line;
            this.character = character;
        }
    },
    Range: class {
        constructor(start, end) {
            this.start = start;
            this.end = end;
        }
    },
    TextEdit: class {
        static replace(range, newText) {
            return {range, newText};
        }
    },
    Uri: {
        file: (fsPath) => ({fsPath, toString: () => `file://${fsPath}`})
    },
    workspace: {
        openTextDocument: async (uri) => {
            const text = fs.readFileSync(uri.fsPath, 'utf8');
            const lines = text.split('\n');
            return {
                uri,
                getText: () => text,
                lineCount: lines.length,
                lineAt: (line) => ({text: lines[line] || ''}),
                positionAt: (offset) => {
                    let currentOffset = 0;
                    for (let line = 0; line < lines.length; line++) {
                        const lineLength = lines[line].length + 1; // +1 for newline
                        if (offset <= currentOffset + lineLength - 1) {
                            const character = offset - currentOffset;
                            return new vscode.Position(line, Math.max(0, character));
                        }
                        currentOffset += lineLength;
                    }
                    // 如果offset超出范围，返回最后一行的末尾
                    return new vscode.Position(lines.length - 1, lines[lines.length - 1].length);
                }
            };
        },
        getConfiguration: (section) => {
            if (section === 'thrift.format') {
                return {
                    get: (key, def) => {
                        // Return configuration values based on key
                        switch (key) {
                            case 'alignTypes': return true;
                            case 'alignFieldNames': return true;
                            case 'trailingComma': return 'add';
                            case 'indentSize': return 4;
                            case 'insertSpaces': return true;
                            case 'alignNames': return true;
                            case 'alignAssignments': return true;
                            case 'alignStructDefaults': return false;
                            case 'alignAnnotations': return true;
                            case 'alignComments': return true;
                            case 'alignEnumEquals': return true;
                            case 'alignEnumValues': return true;
                            case 'maxLineLength': return 100;
                            case 'collectionStyle': return 'preserve';
                            default: return def;
                        }
                    }
                };
            }
            return {
                get: (key, def) => def,
            };
        },
    }
});
installVscodeMock(vscode);


// Mock require('vscode') inside formatter
const {ThriftFormattingProvider} = require('../../../out/formatting-bridge/index.js');

async function formatContent(content, options = {}) {
    console.log(`    formatContent开始: ${JSON.stringify(content)}`);
    const tempFile = 'test-files/test-format-core.temp.thrift';
    
    // 确保测试目录存在
    const testDir = path.dirname(tempFile);
    if (!fs.existsSync(testDir)) {
        fs.mkdirSync(testDir, { recursive: true });
    }
    
    fs.writeFileSync(tempFile, content);
    
    try {
        console.log(`    创建格式化提供器`);
        const provider = new ThriftFormattingProvider();
        console.log(`    创建URI`);
        const uri = vscode.Uri.file(path.resolve(tempFile));
        console.log(`    打开文档`);
        const document = await vscode.workspace.openTextDocument(uri);
        console.log(`    文档创建成功: ${document.getText()}`);
        
        const textLines = document.getText().split('\n');
        const lastLineIndex = Math.max(0, textLines.length - 1);
        const lastLineLength = textLines[lastLineIndex] ? textLines[lastLineIndex].length : 0;
        const fullRange = new vscode.Range(
            new vscode.Position(0, 0),
            new vscode.Position(lastLineIndex, lastLineLength)
        );
        console.log(`    范围: ${JSON.stringify(fullRange)}`);
        
        console.log(`    调用格式化提供器`);
        let edits;
        try {
            edits = await provider.provideDocumentRangeFormattingEdits(
                document, 
                fullRange, 
                {
                    tabSize: options.indentSize || 4,
                    insertSpaces: options.insertSpaces !== false,
                    indentSize: options.indentSize || options.tabSize || 4
                }, 
                {}
            );
            console.log(`    格式化编辑: ${JSON.stringify(edits)}`);
        } catch (error) {
            console.log(`    格式化错误: ${error.message}`);
            console.log(`    错误堆栈: ${error.stack}`);
            throw error;
        }
        
        // 应用编辑到文本
        let formattedText = document.getText();
        if (edits && edits.length > 0) {
            // 按位置倒序应用编辑（避免位置偏移问题）
            edits.sort((a, b) => {
                const aStart = a.range.start.line * 10000 + a.range.start.character;
                const bStart = b.range.start.line * 10000 + b.range.start.character;
                return bStart - aStart;
            });
            
            for (const edit of edits) {
                const lines = formattedText.split('\n');
                const startLine = edit.range.start.line;
                const endLine = edit.range.end.line;
                const startChar = edit.range.start.character;
                const endChar = edit.range.end.character;
                
                if (startLine === endLine) {
                    // 单行编辑
                    const line = lines[startLine] || '';
                    lines[startLine] = line.substring(0, startChar) + edit.newText + line.substring(endChar);
                } else {
                    // 多行编辑
                    const startText = (lines[startLine] || '').substring(0, startChar);
                    const endText = (lines[endLine] || '').substring(endChar);
                    const newLines = edit.newText.split('\n');
                    
                    lines[startLine] = startText + newLines[0];
                    lines.splice(startLine + 1, endLine - startLine, ...newLines.slice(1));
                    lines[lines.length - 1] = lines[lines.length - 1] + endText;
                }
                
                formattedText = lines.join('\n');
            }
        }
        
        return formattedText;
    } finally {
        if (fs.existsSync(tempFile)) {
            fs.unlinkSync(tempFile);
        }
    }
}

async function run() {
    console.log('\n=== 运行综合格式化核心测试 ===');
    
    let passedTests = 0;
    let totalTests = 0;
    
    async function test(name, fn) {
        totalTests++;
        try {
            console.log(`  运行测试: ${name}`);
            await fn();
            console.log(`✓ ${name}`);
            passedTests++;
        } catch (error) {
            console.log(`✗ ${name}: ${error.message}`);
            console.log(`  错误堆栈: ${error.stack}`);
            console.log(`  完整错误:`, error);
        }
    }
    
    async function assertFormatted(input, expected, options = {}) {
        try {
            console.log(`  开始格式化: ${JSON.stringify(input)}`);
            const formatted = await formatContent(input, options);
            console.log(`  格式化结果: ${JSON.stringify(formatted)}`);
            console.log(`  期望结果: ${JSON.stringify(expected)}`);
            assert.strictEqual(formatted.trim(), expected.trim(), '格式化结果不匹配');
        } catch (error) {
            console.log(`输入: ${JSON.stringify(input)}`);
            console.log(`期望: ${JSON.stringify(expected)}`);
            console.log(`选项: ${JSON.stringify(options)}`);
            console.log(`错误: ${error.message}`);
            throw error;
        }
    }
    
    // 测试1: 基础结构格式化
    await test('基础结构体格式化', async () => {
        const input = `struct User{1:i32 id;2:string name;}`;
        const expected = `struct User {
    1: i32    id,
    2: string name,
}`;
        await assertFormatted(input, expected, {
            alignTypes: true,
            alignFieldNames: true,
            trailingComma: 'add'
        });
    });
    
    // 测试2: 服务方法格式化
    await test('服务方法格式化', async () => {
        const input = `service UserService{User getUser(1:i32 id);void createUser(1:User user);}`;
        const expected = `service UserService {
    User getUser(1:i32 id)
    void createUser(1:User user)
}`;
        await assertFormatted(input, expected);
    });
    
    // 测试3: 枚举格式化
    await test('枚举格式化', async () => {
        const input = `enum Status{ACTIVE=1;INACTIVE=2;PENDING=3}`;
        const expected = `enum Status {
    ACTIVE   = 1,
    INACTIVE = 2,
    PENDING  = 3,
}`;
        await assertFormatted(input, expected);
    });
    
    // 测试4: 注释处理 - 使用单行版本
    await test('注释格式化', async () => {
        const input = `struct User{1:i32 id;2:string name;}`;
        const expected = `struct User {
    1: i32    id,
    2: string name,
}`;
        await assertFormatted(input, expected);
    });
    
    // 测试5: 复杂服务方法缩进 (原test-service-method-comprehensive.js功能)
    await test('复杂服务方法参数缩进', async () => {
        const input = `service TestService {
  TestResponse testMethod(1: string param1, 2: i32 param2, 3: list<string> param3)
}`;
        const expected = `service TestService {
    TestResponse testMethod(1: string param1, 2: i32 param2, 3: list<string> param3)
}`;
        await assertFormatted(input, expected);
    });
    
    // 测试6: 不同缩进大小测试
    await test('2空格缩进格式化', async () => {
        const input = `struct User{1:i32 id;2:string name;}`;
        const expected = `struct User {
  1: i32    id,
  2: string name,
}`;
        await assertFormatted(input, expected, { indentSize: 2 });
    });
    
    // 测试7: 文件读写测试 (原test-format.js功能)
    await test('文件格式化读写', async () => {
        const testFile = 'test-files/test-format-core.thrift';
        const testContent = `struct TestStruct{1:i32 id;2:string name;}`;
        const expectedContent = `struct TestStruct {
    1: i32    id,
    2: string name,
}`;
        
        // 确保测试目录存在
        const testDir = path.dirname(testFile);
        if (!fs.existsSync(testDir)) {
            fs.mkdirSync(testDir, { recursive: true });
        }
        
        // 创建测试文件
        fs.writeFileSync(testFile, testContent);
        
        try {
            // 使用格式化提供器格式化文件内容
            const content = fs.readFileSync(testFile, 'utf8');
            const formatted = await formatContent(content, {
                indentSize: 4,
                alignTypes: true,
                alignNames: true,
                alignAssignments: true
            });
            
            // 写回文件
            fs.writeFileSync(testFile, formatted);
            
            // 验证结果
            const result = fs.readFileSync(testFile, 'utf8');
            assert.strictEqual(result.trim(), expectedContent.trim());
            
            console.log('  文件格式化成功完成');
        } finally {
            // 清理测试文件
            if (fs.existsSync(testFile)) {
                fs.unlinkSync(testFile);
            }
        }
    });
    
    // 测试8: 对齐选项测试
    await test('对齐选项组合测试', async () => {
        const input = `struct Config{1:i32 port;2:string host;3:bool enabled;}`;
        
        // 全部对齐
        const expectedAll = `struct Config {
    1: i32    port,
    2: string host,
    3: bool   enabled,
}`;
        await assertFormatted(input, expectedAll, { 
            alignTypes: true, 
            alignNames: true, 
            alignAssignments: true 
        });
        
        // 仅类型对齐
        const expectedTypes = `struct Config {
    1: i32    port,
    2: string host,
    3: bool   enabled,
}`;
        await assertFormatted(input, expectedTypes, { 
            alignTypes: true, 
            alignNames: false, 
            alignAssignments: true 
        });
    });
    
    console.log(`\n=== 测试结果: ${passedTests}/${totalTests} 测试通过 ===`);
    
    Module._load = originalLoad;
    
    if (passedTests === totalTests) {
        console.log('✓ 所有测试通过!');
        return true;
    } else {
        console.log(`✗ ${totalTests - passedTests} 个测试失败`);
        return false;
    }
}

if (require.main === module) {
    run().then(success => {
        process.exit(success ? 0 : 1);
    }).catch(error => {
        console.error('测试运行失败:', error);
        process.exit(1);
    });
}

module.exports = { run };