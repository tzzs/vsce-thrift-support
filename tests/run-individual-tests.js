// 单独运行每个测试以找出失败的那个
const fs = require('fs');
const path = require('path');

// Mock VSCode API
const { createVscodeMock, installVscodeMock } = require('./mock_vscode.js');
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
            return { range, newText };
        }
    },
    Uri: {
        file: (fsPath) => ({ fsPath, toString: () => `file://${fsPath}` })
    },
    workspace: {
        openTextDocument: async (uri) => {
            const text = fs.readFileSync(uri.fsPath, 'utf8');
            const lines = text.split('\n');
            return {
                uri,
                getText: () => text,
                lineCount: lines.length,
                lineAt: (line) => ({ text: lines[line] || '' }),
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
                    return new vscode.Position(lines.length - 1, lines[lines.length - 1].length);
                }
            };
        },
        getConfiguration: (section) => {
            // Mock configuration - return default values
            return {
                get: (key, defaultValue) => {
                    const config = {
                        'indentSize': 4,
                        'insertSpaces': true,
                        'alignTypes': true,
                        'alignFieldNames': true,
                        'alignAssignments': true,
                        'trailingComma': 'add',
                        'newlineBeforeOpenBrace': true,
                        'newlineAfterOpenBrace': true,
                        'newlineBeforeCloseBrace': true,
                        'alignNames': true,
                        'alignStructDefaults': false,
                        'alignEnumEquals': true,
                        'alignEnumValues': true,
                        'alignAnnotations': true,
                        'alignStructAnnotations': true,
                        'alignComments': true,
                        'maxLineLength': 100,
                        'collectionStyle': 'preserve'
                    };
                    return config[key] !== undefined ? config[key] : defaultValue;
                }
            };
        }
    },
    languages: {
        registerDocumentFormattingEditProvider: () => { },
        registerDocumentRangeFormattingEditProvider: () => { }
    }
});
installVscodeMock(vscode);


// Mock global vscode
global.vscode = vscode;

// Override Module._load to intercept vscode requires
// Load the formatting provider
const { ThriftFormattingProvider } = require('../out/src/formattingProvider');

async function formatContent(content, options = {}) {
    const tempFile = 'temp-format-test.thrift';

    // 确保测试目录存在
    const testDir = path.dirname(tempFile);
    if (!fs.existsSync(testDir)) {
        fs.mkdirSync(testDir, { recursive: true });
    }

    fs.writeFileSync(tempFile, content);

    try {
        const provider = new ThriftFormattingProvider();
        const uri = vscode.Uri.file(path.resolve(tempFile));
        const document = await vscode.workspace.openTextDocument(uri);

        const textLines = document.getText().split('\n');
        const lastLineIndex = Math.max(0, textLines.length - 1);
        const lastLineLength = textLines[lastLineIndex] ? textLines[lastLineIndex].length : 0;
        const fullRange = new vscode.Range(
            new vscode.Position(0, 0),
            new vscode.Position(lastLineIndex, lastLineLength)
        );

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
        } catch (error) {
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

async function assertFormatted(input, expected, options = {}) {
    const formatted = await formatContent(input, options);
    if (formatted.trim() !== expected.trim()) {
        throw new Error(`格式化结果不匹配:\n实际: ${JSON.stringify(formatted.trim())}\n期望: ${JSON.stringify(expected.trim())}`);
    }
}

// Define all tests
const tests = [
    {
        name: '基础结构体格式化',
        fn: async () => {
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
        }
    },
    {
        name: '服务方法格式化',
        fn: async () => {
            const input = `service UserService{User getUser(1:i32 id);void createUser(1:User user);}`;
            const expected = `service UserService {
    User getUser(1:i32 id)
    void createUser(1:User user)
}`;
            await assertFormatted(input, expected);
        }
    },
    {
        name: '枚举格式化',
        fn: async () => {
            const input = `enum Status{ACTIVE=1;INACTIVE=2;PENDING=3}`;
            const expected = `enum Status {
    ACTIVE   = 1,
    INACTIVE = 2,
    PENDING  = 3,
}`;
            await assertFormatted(input, expected);
        }
    },
    {
        name: '注释格式化',
        fn: async () => {
            const input = `struct User{1:i32 id;2:string name;}`;
            const expected = `struct User {
    1: i32    id,
    2: string name,
}`;
            await assertFormatted(input, expected);
        }
    },
    {
        name: '复杂服务方法参数缩进',
        fn: async () => {
            const input = `service TestService {
  TestResponse testMethod(1: string param1, 2: i32 param2, 3: list<string> param3)
}`;
            const expected = `service TestService {
    TestResponse testMethod(1: string param1, 2: i32 param2, 3: list<string> param3)
}`;
            await assertFormatted(input, expected);
        }
    },
    {
        name: '2空格缩进格式化',
        fn: async () => {
            const input = `struct User{1:i32 id;2:string name;}`;
            const expected = `struct User {
  1: i32    id,
  2: string name,
}`;
            await assertFormatted(input, expected, { indentSize: 2 });
        }
    },
    {
        name: '文件格式化读写',
        fn: async () => {
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
                if (result.trim() !== expectedContent.trim()) {
                    throw new Error(`文件内容不匹配: 期望 ${JSON.stringify(expectedContent.trim())}, 实际 ${JSON.stringify(result.trim())}`);
                }
            } finally {
                // 清理测试文件
                if (fs.existsSync(testFile)) {
                    fs.unlinkSync(testFile);
                }
            }
        }
    },
    {
        name: '对齐选项组合测试',
        fn: async () => {
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
        }
    }
];

// Run each test individually
async function runIndividualTests() {
    console.log('=== 单独运行每个测试 ===\n');

    let totalTests = 0;
    let passedTests = 0;

    for (const test of tests) {
        totalTests++;
        console.log(`运行测试: ${test.name}`);

        try {
            await test.fn();
            console.log(`✓ ${test.name}`);
            passedTests++;
        } catch (error) {
            console.log(`✗ ${test.name}: ${error.message}`);
            console.log(`  错误: ${error.stack}`);
        }
        console.log('');
    }

    console.log(`=== 测试结果: ${passedTests}/${totalTests} 测试通过 ===`);

    if (passedTests === totalTests) {
        console.log('✓ 所有测试通过!');
    } else {
        console.log(`✗ ${totalTests - passedTests} 个测试失败`);
    }
}

runIndividualTests().catch(error => {
    console.error('测试运行失败:', error);
});