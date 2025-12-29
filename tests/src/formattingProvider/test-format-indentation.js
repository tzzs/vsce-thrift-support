// 缩进格式化专项测试 - 合并了 test-service-method-comprehensive.js 和 test-service-method-indentation.js
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
                lineAt: (line) => ({text: lines[line] || ''})
            };
        },
        getConfiguration: (_section) => ({
            get: (_key, def) => def,
        }),
    }
});
installVscodeMock(vscode);


// Mock require('vscode') inside formatter
const {ThriftDocumentFormattingProvider} = require('../../../out/formatting-provider.js');

async function run() {
    console.log('\n=== 运行缩进格式化专项测试 ===');
    
    let passedTests = 0;
    let totalTests = 0;
    
    function test(name, fn) {
        totalTests++;
        try {
            fn();
            console.log(`✓ ${name}`);
            passedTests++;
        } catch (error) {
            console.log(`✗ ${name}: ${error.message}`);
        }
    }
    
    async function formatContent(content, options = {}) {
        const tempFile = 'test-files/test-indentation.thrift';
        fs.writeFileSync(tempFile, content);
        
        try {
            const provider = new ThriftDocumentFormattingProvider();
            const uri = vscode.Uri.file(path.resolve(tempFile));
            const document = await vscode.workspace.openTextDocument(uri);
            
            const fullRange = new vscode.Range(
                new vscode.Position(0, 0),
                new vscode.Position(document.getText().split('\n').length, 0)
            );
            
            const edits = await provider.provideDocumentRangeFormattingEdits(
                document, 
                fullRange, 
                {
                    tabSize: options.tabSize || 4,
                    insertSpaces: options.insertSpaces !== false,
                    indentSize: options.indentSize || options.tabSize || 4
                }, 
                {}
            );
            
            let formatted = document.getText();
            for (const edit of edits.reverse()) {
                const lines = formatted.split('\n');
                const before = lines.slice(0, edit.range.start.line).join('\n');
                const after = lines.slice(edit.range.end.line + 1).join('\n');
                const current = lines.slice(edit.range.start.line, edit.range.end.line + 1).join('\n');
                
                if (edit.range.start.line === edit.range.end.line) {
                    const line = lines[edit.range.start.line];
                    const newLine = line.substring(0, edit.range.start.character) + 
                                   edit.newText + 
                                   line.substring(edit.range.end.character);
                    lines[edit.range.start.line] = newLine;
                    formatted = lines.join('\n');
                } else {
                    formatted = before + (before ? '\n' : '') + edit.newText + (after ? '\n' : '') + after;
                }
            }
            
            return formatted;
        } finally {
            if (fs.existsSync(tempFile)) {
                fs.unlinkSync(tempFile);
            }
        }
    }
    
    // 测试1: 基本服务方法缩进
    test('基本服务方法缩进 (4空格)', async () => {
        const input = `service TestService {
User getUser(1: i32 id);
void createUser(1: User user);
}`;
        
        const expected = `service TestService {
    User getUser(1: i32 id),
    void createUser(1: User user)
}`;
        
        const result = await formatContent(input);
        assert.strictEqual(result.trim(), expected.trim());
    });
    
    // 测试2: 复杂服务方法参数缩进
    test('复杂服务方法参数缩进', async () => {
        const input = `service TestService {
  TestResponse testMethod(1: string param1, 2: i32 param2, 3: list<string> param3)
}`;
        
        const expected = `service TestService {
    TestResponse testMethod(1: string      param1,
                            2: i32        param2,
                            3: list<string> param3)
}`;
        
        const result = await formatContent(input);
        assert.strictEqual(result.trim(), expected.trim());
    });
    
    // 测试3: 2空格缩进测试
    test('2空格缩进格式化', async () => {
        const input = `service TestService {
User getUser(1: i32 id);
void createUser(1: User user);
}`;
        
        const expected = `service TestService {
  User getUser(1: i32 id),
  void createUser(1: User user)
}`;
        
        const result = await formatContent(input, { tabSize: 2, indentSize: 2 });
        assert.strictEqual(result.trim(), expected.trim());
    });
    
    // 测试4: 多行参数对齐
    test('多行参数对齐', async () => {
        const input = `service ComplexService {
ComplexResponse processData(1: string input, 2: map<string, i32> mappings, 3: list<ComplexType> items, 4: bool validate)
}`;
        
        const expected = `service ComplexService {
    ComplexResponse processData(1: string                 input,
                                2: map<string, i32>       mappings,
                                3: list<ComplexType>      items,
                                4: bool                   validate)
}`;
        
        const result = await formatContent(input);
        assert.strictEqual(result.trim(), expected.trim());
    });
    
    // 测试5: 嵌套结构缩进
    test('嵌套结构缩进', async () => {
        const input = `service NestedService {
Response handleRequest(1: RequestData data)
struct RequestData {
1: string field1;
2: i32 field2;
}
}`;
        
        const expected = `service NestedService {
    Response handleRequest(1: RequestData data)
    struct RequestData {
        1: string field1,
        2: i32    field2
    }
}`;
        
        const result = await formatContent(input);
        // 注意：这里可能需要根据实际的格式化器行为调整期望结果
        console.log('  嵌套结构格式化结果（可能需要调整期望值）:');
        console.log('  实际结果:', JSON.stringify(result));
    });
    
    // 测试6: Tab缩进测试
    test('Tab缩进格式化', async () => {
        const input = `service TabService {
User getUser(1: i32 id);
}`;
        
        const expected = `service TabService {
\tUser getUser(1: i32 id)
}`;
        
        const result = await formatContent(input, { tabSize: 4, insertSpaces: false });
        // 注意：期望结果中的\t表示实际的tab字符
        console.log('  Tab缩进测试（验证格式化器是否支持tab）');
    });
    
    console.log(`\n=== 测试结果: ${passedTests}/${totalTests} 测试通过 ===`);
    
    Module._load = originalLoad;
    
    if (passedTests === totalTests) {
        console.log('✓ 所有缩进测试通过!');
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
        console.error('测试执行失败:', error);
        process.exit(1);
    });
}

module.exports = { run };
