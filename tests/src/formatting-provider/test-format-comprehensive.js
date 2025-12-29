// 综合格式化测试 - 合并和优化版本
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
                        const lineLength = lines[line].length + 1;
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
            if (section === 'thrift.format') {
                return {
                    get: (key, defaultValue) => {
                        const config = {
                            'alignTypes': true,
                            'alignFieldNames': true,
                            'trailingComma': 'add',
                            'indentSize': 4,
                            'insertSpaces': true,
                            'alignNames': true,
                            'alignAssignments': true,
                            'alignStructDefaults': false,
                            'alignAnnotations': true,
                            'alignComments': true,
                            'alignEnumEquals': true,
                            'alignEnumValues': true,
                            'maxLineLength': 100,
                            'collectionStyle': 'preserve'
                        };
                        return config[key] !== undefined ? config[key] : defaultValue;
                    }
                };
            }
            return {
                get: (key, defaultValue) => defaultValue,
            };
        }
    }
});
installVscodeMock(vscode);


// 模拟全局 vscode
Object.assign(global, { vscode });

// Mock require('vscode') inside formatter
// 加载格式化提供程序
const { ThriftFormattingProvider } = require(path.join(__dirname, '../../../out/formatting-provider'));

/**
 * 格式化内容辅助函数
 */
async function formatContent(content, options = {}) {
    const provider = new ThriftFormattingProvider();
    
    // 创建模拟文档
    const document = {
        uri: vscode.Uri.file('test.thrift'),
        getText: () => content,
        lineCount: content.split('\n').length,
        lineAt: (line) => ({
            text: (content.split('\n')[line] || ''),
            lineNumber: line
        }),
        positionAt: (offset) => {
            const lines = content.split('\n');
            let currentOffset = 0;
            for (let line = 0; line < lines.length; line++) {
                const lineLength = lines[line].length + 1;
                if (offset <= currentOffset + lineLength - 1) {
                    const character = offset - currentOffset;
                    return new vscode.Position(line, Math.max(0, character));
                }
                currentOffset += lineLength;
            }
            return new vscode.Position(lines.length - 1, lines[lines.length - 1].length);
        }
    };

    // 设置配置选项
    const originalGetConfig = vscode.workspace.getConfiguration;
    vscode.workspace.getConfiguration = (section) => {
        if (section === 'thrift.format') {
            return {
                get: (key, defaultValue) => {
                    const config = {
                        'alignTypes': options.alignTypes !== undefined ? options.alignTypes : true,
                        'alignFieldNames': options.alignFieldNames !== undefined ? options.alignFieldNames : true,
                        'trailingComma': options.trailingComma || 'add',
                        'indentSize': options.indentSize || 4,
                        'insertSpaces': options.insertSpaces !== undefined ? options.insertSpaces : true,
                        'alignNames': options.alignNames !== undefined ? options.alignNames : true,
                        'alignAssignments': options.alignAssignments !== undefined ? options.alignAssignments : true,
                        'alignStructDefaults': options.alignStructDefaults || false,
                        'alignAnnotations': options.alignAnnotations !== undefined ? options.alignAnnotations : true,
                        'alignComments': options.alignComments !== undefined ? options.alignComments : true,
                        'alignEnumEquals': options.alignEnumEquals !== undefined ? options.alignEnumEquals : true,
                        'alignEnumValues': options.alignEnumValues !== undefined ? options.alignEnumValues : true,
                        'maxLineLength': options.maxLineLength || 100,
                        'collectionStyle': options.collectionStyle || 'preserve'
                    };
                    return config[key] !== undefined ? config[key] : defaultValue;
                }
            };
        }
        return originalGetConfig(section);
    };

    try {
        const textLines = document.getText().split('\n');
        const lastLineIndex = Math.max(0, textLines.length - 1);
        const lastLineLength = textLines[lastLineIndex] ? textLines[lastLineIndex].length : 0;
        const fullRange = new vscode.Range(
            new vscode.Position(0, 0),
            new vscode.Position(lastLineIndex, lastLineLength)
        );
        
        const edits = await provider.provideDocumentRangeFormattingEdits(
            document,
            fullRange,
            {
                tabSize: options.indentSize || 4,
                insertSpaces: options.insertSpaces !== undefined ? options.insertSpaces : true
            }
        );
        
        if (!edits || edits.length === 0) {
            return content;
        }

        // 应用编辑
        const offsetAt = (text, position) => {
            const lines = text.split('\n');
            let offset = 0;
            for (let line = 0; line < position.line; line++) {
                offset += (lines[line] || '').length + 1;
            }
            return offset + position.character;
        };

        let result = content;
        for (const edit of edits.reverse()) {
            const startOffset = offsetAt(content, edit.range.start);
            const endOffset = offsetAt(content, edit.range.end);
            result = result.substring(0, startOffset) + edit.newText + result.substring(endOffset);
        }
        
        return result;
    } catch (error) {
        console.log(`格式化错误: ${error}`);
        return content;
    } finally {
        vscode.workspace.getConfiguration = originalGetConfig;
    }
}

/**
 * 测试辅助函数
 */
async function test(name, fn) {
    console.log(`\n🧪 ${name}`);
    try {
        await fn();
        console.log(`✅ ${name} - 通过`);
    } catch (error) {
        console.error(`❌ ${name} - 失败:`, error.message);
        throw error;
    }
}

/**
 * 格式化断言辅助函数
 */
async function assertFormatted(input, expected, options = {}) {
    const result = await formatContent(input, options);
    if (result.trim() !== expected.trim()) {
        console.log('输入:', input);
        console.log('期望:', expected);
        console.log('实际:', result);
        throw new Error('格式化结果不匹配');
    }
}

/**
 * 主要测试运行函数
 */
async function runAllTests() {
    console.log('🚀 开始综合格式化测试...\n');
    
    // 基础格式化测试
    await test('基础结构体格式化 (默认配置)', async () => {
        const input = `struct User{1:i32 id;2:string name;}`;
        const expected = `struct User {
    1: i32    id,
    2: string name,
}`;
        await assertFormatted(input, expected);
    });

    await test('基础结构体格式化 (无对齐)', async () => {
        const input = `struct User{1:i32 id;2:string name;}`;
        const expected = `struct User {
    1: i32 id
    2: string name
}`;
        await assertFormatted(input, expected, {
            alignTypes: false,
            alignFieldNames: false,
            trailingComma: 'remove'
        });
    });

    await test('枚举格式化 (默认配置)', async () => {
        const input = `enum Status{ACTIVE=1;INACTIVE=2;PENDING=3}`;
        const expected = `enum Status {
    ACTIVE   = 1,
    INACTIVE = 2,
    PENDING  = 3,
}`;
        await assertFormatted(input, expected);
    });

    await test('枚举格式化 (无对齐)', async () => {
        const input = `enum Status{ACTIVE=1;INACTIVE=2;PENDING=3}`;
        const expected = `enum Status {
    ACTIVE   = 1
    INACTIVE = 2
    PENDING  = 3
}`;
        await assertFormatted(input, expected, {
            alignTypes: false,
            alignFieldNames: false,
            trailingComma: 'remove'
        });
    });

    await test('服务方法格式化', async () => {
        const input = `service UserService{User getUser(1:i32 id);void createUser(1:User user);}`;
        const expected = `service UserService {
    User getUser(1:i32 id)
    void createUser(1:User user)
}`;
        await assertFormatted(input, expected);
    });

    await test('复杂服务方法参数缩进', async () => {
        const input = `service ComplexService {
  Response processData(1: Request request, 2: map<string, list<i32>> data, 3: set<string> tags);
}`;
        const expected = `service ComplexService {
    Response processData(
        1: Request request,
        2: map<string, list<i32>> data,
        3: set<string> tags
    )
}`;
        await assertFormatted(input, expected);
    });

    await test('注释格式化', async () => {
        const input = `struct User{1:i32 id;// 用户ID
2:string name;// 用户名}`;
        const expected = `struct User {
    1: i32    id,     // 用户ID
    2: string name,   // 用户名
}`;
        await assertFormatted(input, expected);
    });

    await test('2空格缩进格式化', async () => {
        const input = `struct User{1:i32 id;2:string name;}`;
        const expected = `struct User {
  1: i32    id,
  2: string name,
}`;
        await assertFormatted(input, expected, {
            indentSize: 2
        });
    });

    await test('尾随逗号配置测试', async () => {
        const input = `struct User{1:i32 id;2:string name;}`;
        const expectedAdd = `struct User {
    1: i32    id,
    2: string name,
}`;
        const expectedRemove = `struct User {
    1: i32    id
    2: string name
}`;
        const expectedPreserve = `struct User {
    1: i32    id,
    2: string name
}`;
        
        await assertFormatted(input, expectedAdd, { trailingComma: 'add' });
        await assertFormatted(input, expectedRemove, { trailingComma: 'remove' });
        await assertFormatted(input, expectedPreserve, { trailingComma: 'preserve' });
    });

    await test('对齐选项组合测试', async () => {
        const input = `struct Config{1:i32 timeout;2:string host;3:bool enabled;}`;
        const expected = `struct Config {
    1: i32    timeout,
    2: string host,
    3: bool   enabled,
}`;
        await assertFormatted(input, expected, {
            alignTypes: true,
            alignFieldNames: true
        });
    });

    await test('复杂嵌套结构格式化', async () => {
        const input = `struct Complex{1:map<string,list<i32>> data;2:set<string> tags;3:optional User user;}`;
        const expected = `struct Complex {
    1: map<string, list<i32>> data,
    2: set<string>           tags,
    3: optional User       user,
}`;
        await assertFormatted(input, expected);
    });

    await test('注解格式化', async () => {
        const input = `struct User{
@deprecated("旧版本")
1:i32 id;
@required
2:string name;
}`;
        const expected = `struct User {
    @deprecated("旧版本")
    1: i32    id,
    @required
    2: string name,
}`;
        await assertFormatted(input, expected);
    });

    console.log('\n✨ 所有综合格式化测试完成！');
}

// 如果直接运行此文件，则执行测试
if (require.main === module) {
    runAllTests().catch(error => {
        console.error('测试运行失败:', error);
        process.exit(1);
    });
}

module.exports = { runAllTests, formatContent, assertFormatted };
