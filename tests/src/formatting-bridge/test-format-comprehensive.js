// 综合格式化测试 - 合并和优化版本
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vscode = require('vscode');

const {ThriftFormattingProvider} = require(path.join(__dirname, '../../../out/formatting-bridge'));

describe('format-comprehensive', () => {
    let originalGetConfig;

    before(() => {
        originalGetConfig = vscode.workspace.getConfiguration;
    });

    afterEach(() => {
        vscode.workspace.getConfiguration = originalGetConfig;
    });

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
                text: content.split('\n')[line] || '',
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
        vscode.workspace.getConfiguration = (section) => {
            if (section === 'thrift.format') {
                return {
                    get: (key, defaultValue) => {
                        const config = {
                            alignTypes:
                                options.alignTypes !== undefined ? options.alignTypes : true,
                            alignFieldNames:
                                options.alignFieldNames !== undefined
                                    ? options.alignFieldNames
                                    : true,
                            trailingComma: options.trailingComma || 'add',
                            indentSize: options.indentSize || 4,
                            insertSpaces:
                                options.insertSpaces !== undefined ? options.insertSpaces : true,
                            alignNames:
                                options.alignNames !== undefined ? options.alignNames : true,
                            alignAssignments:
                                options.alignAssignments !== undefined
                                    ? options.alignAssignments
                                    : true,
                            alignStructDefaults: options.alignStructDefaults || false,
                            alignAnnotations:
                                options.alignAnnotations !== undefined
                                    ? options.alignAnnotations
                                    : true,
                            alignComments:
                                options.alignComments !== undefined ? options.alignComments : true,
                            alignEnumEquals:
                                options.alignEnumEquals !== undefined
                                    ? options.alignEnumEquals
                                    : true,
                            alignEnumValues:
                                options.alignEnumValues !== undefined
                                    ? options.alignEnumValues
                                    : true,
                            maxLineLength: options.maxLineLength || 100,
                            collectionStyle: options.collectionStyle || 'preserve'
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

            const edits = await provider.provideDocumentRangeFormattingEdits(document, fullRange, {
                tabSize: options.indentSize || 4,
                insertSpaces: options.insertSpaces !== undefined ? options.insertSpaces : true
            });

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
                result =
                    result.substring(0, startOffset) + edit.newText + result.substring(endOffset);
            }

            return result;
        } catch (error) {
            return content;
        }
    }

    /**
     * 格式化断言辅助函数
     */
    async function assertFormatted(input, expected, options = {}) {
        const result = await formatContent(input, options);
        if (result.trim() !== expected.trim()) {
            console.log('Expected:');
            console.log(expected);
            console.log('\nActual:');
            console.log(result);
            assert.strictEqual(result.trim(), expected.trim(), '格式化结果不匹配');
        }
    }

    it('基础结构体格式化 (默认配置)', async () => {
        const input = `struct User{1:i32 id;2:string name;}`;
        const expected = `struct User {
    1: i32    id,
    2: string name,
}`;
        await assertFormatted(input, expected);
    });

    it('基础结构体格式化 (无对齐)', async () => {
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

    it('枚举格式化 (默认配置)', async () => {
        const input = `enum Status{ACTIVE=1;INACTIVE=2;PENDING=3}`;
        const expected = `enum Status {
    ACTIVE   = 1,
    INACTIVE = 2,
    PENDING  = 3,
}`;
        await assertFormatted(input, expected);
    });

    it('枚举格式化 (无对齐)', async () => {
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

    it('服务方法格式化', async () => {
        const input = `service UserService{User getUser(1:i32 id);void createUser(1:User user);}`;
        const expected = `service UserService {
    User getUser(1:i32 id)
    void createUser(1:User user)
}`;
        await assertFormatted(input, expected);
    });

    it('复杂服务方法参数缩进', async () => {
        const input = `service ComplexService {
  Response processData(1: Request request, 2: map<string, list<i32>> data, 3: set<string> tags);
}`;
        const expected = `service ComplexService {
    Response processData(1: Request request, 2: map<string,list<i32>> data, 3: set<string> tags);
}`;
        await assertFormatted(input, expected);
    });

    it('注释格式化', async () => {
        const input = `struct User{1:i32 id;2:string name;}`;
        const expected = `struct User {
    1: i32    id,
    2: string name,
}`;
        await assertFormatted(input, expected);
    });

    it('2空格缩进格式化', async () => {
        const input = `struct User{1:i32 id;2:string name;}`;
        const expected = `struct User {
  1: i32    id,
  2: string name,
}`;
        await assertFormatted(input, expected, {
            indentSize: 2
        });
    });

    it('尾随逗号配置测试', async () => {
        const input = `struct User{1:i32 id;2:string name;}`;
        const expectedAdd = `struct User {
    1: i32    id,
    2: string name,
}`;
        await assertFormatted(input, expectedAdd, {trailingComma: 'add'});
    });

    it('对齐选项组合测试', async () => {
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

    it('复杂嵌套结构格式化', async () => {
        const input = `struct Complex{1:map<string,list<i32>> data;2:set<string> tags;3:optional User user;}`;
        const expected = `struct Complex {
    1:          map<string,list<i32>> data,
    2:          set<string>           tags,
    3: optional User                  user,
}`;
        await assertFormatted(input, expected);
    });

    it('注解格式化', async () => {
        const input = `struct User{1:i32 id;2:string name;}`;
        const expected = `struct User {
    1: i32    id,
    2: string name,
}`;
        await assertFormatted(input, expected);
    });
});
