// 服务方法参数缩进综合测试
const path = require('path');
const fs = require('fs');

// Mock minimal VS Code API used by the formatter
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
// Import the formatter provider (compiled output)
const {ThriftFormattingProvider} = require('../../../out/formattingProvider.js');

// 测试用例集合
const testCases = [
    {
        name: '基本服务方法参数',
        input: `service TestService {
    // ping
    PingResponse Ping(
    1: required trace.Trace traceInfo,
    2: required PingRequest request
    )
}`,
        expectedParamIndent: 4
    },
    {
        name: '多个服务方法',
        input: `service UserService {
    // 获取用户信息
    UserInfo GetUser(
    1: required i64 userId,
    2: optional string token
    )
    
    // 更新用户信息
    UpdateResponse UpdateUser(
    1: required i64 userId,
    2: required UserInfo userInfo,
    3: optional string reason
    )
}`,
        expectedParamIndent: 4
    },
    {
        name: '复杂类型参数',
        input: `service DataService {
    // 处理复杂数据
    ProcessResponse ProcessData(
    1: required list<string> dataList,
    2: optional map<string, UserInfo> userMap,
    3: required map<i32, list<Permission>> permissionMatrix
    )
}`,
        expectedParamIndent: 4
    },
    {
        name: '带异常声明的服务方法',
        input: `service PaymentService {
    // 处理支付
    PaymentResponse ProcessPayment(
    1: required PaymentRequest request,
    2: optional PaymentOptions options
    ) throws (
    1: PaymentException paymentError,
    2: ValidationException validationError
    )
}`,
        expectedParamIndent: 4
    }
];

async function testServiceMethodFormatting() {
    console.log('=== 服务方法参数缩进综合测试 ===\n');

    const provider = new ThriftFormattingProvider();
    let allPassed = true;

    for (const testCase of testCases) {
        console.log(`测试用例: ${testCase.name}`);

        // 创建临时测试文件
        const tempFilePath = path.join(__dirname, `temp-service-test-${Date.now()}.thrift`);
        fs.writeFileSync(tempFilePath, testCase.input);

        try {
            const testUri = vscode.Uri.file(tempFilePath);
            const doc = await vscode.workspace.openTextDocument(testUri);

            const fullRange = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(1000, 0));
            const edits = await provider.provideDocumentRangeFormattingEdits(doc, fullRange, {
                tabSize: 2,
                insertSpaces: true,
                indentSize: 2
            }, {});

            if (!Array.isArray(edits)) {
                console.log('  ❌ 格式化提供者没有返回编辑数组');
                allPassed = false;
                continue;
            }

            // 应用编辑到原始文本
            let formattedText = doc.getText();
            for (const edit of edits) {
                const lines = formattedText.split('\n');
                const startLine = edit.range.start.line;
                const endLine = edit.range.end.line;

                lines.splice(startLine, endLine - startLine + 1, ...edit.newText.split('\n'));
                formattedText = lines.join('\n');
            }

            // 检查所有参数行的缩进
            const formattedLines = formattedText.split('\n');
            const paramLines = formattedLines.filter(line => /^\s*\d+:\s*/.test(line));

            console.log(`  找到 ${paramLines.length} 个参数行`);

            let passed = true;
            for (const paramLine of paramLines) {
                const actualIndent = paramLine.match(/^(\s*)/)[1].length;
                console.log(`  参数行: "${paramLine.trim()}" -> 缩进: ${actualIndent} 空格`);

                if (actualIndent !== testCase.expectedParamIndent) {
                    console.log(`  ❌ 缩进不正确，期望 ${testCase.expectedParamIndent}，实际 ${actualIndent}`);
                    passed = false;
                }
            }

            if (passed && paramLines.length > 0) {
                console.log('  ✅ 所有参数缩进正确');
            } else if (paramLines.length === 0) {
                console.log('  ⚠️  没有找到参数行');
                passed = false;
            }

            if (!passed) {
                console.log('  原始代码:');
                console.log(testCase.input);
                console.log('  格式化后代码:');
                console.log(formattedText);
                allPassed = false;
            }

        } catch (error) {
            console.log(`  ❌ 测试执行失败: ${error.message}`);
            allPassed = false;
        } finally {
            // 清理临时文件
            if (fs.existsSync(tempFilePath)) {
                try {
                    fs.unlinkSync(tempFilePath);
                } catch (error) {
                    console.warn(`临时文件删除失败: ${tempFilePath} (${error.message})`);
                }
            }
        }

        console.log(''); // 空行分隔
    }

    return allPassed;
}

// 运行测试
(async function run() {
    try {
        const success = await testServiceMethodFormatting();
        console.log(`=== 测试结果: ${success ? '✅ 全部通过' : '❌ 有失败用例'} ===`);
        process.exit(success ? 0 : 1);
    } catch (error) {
        console.error('测试套件执行失败:', error);
        process.exit(1);
    }
})();
