const assert = require('assert');
const path = require('path');
const vscode = require('vscode');

const {ThriftFormattingProvider} = require('../../../out/formatting-bridge/index.js');

describe('service-method-comprehensive', () => {
    const testCases = [
        {
            name: 'basic service method parameters',
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
            name: 'multiple service methods',
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
            name: 'complex type parameters',
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
            name: 'service method with throws',
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

    testCases.forEach(testCase => {
        it(`should format ${testCase.name}`, async () => {
            const provider = new ThriftFormattingProvider();

            const document = {
                uri: {fsPath: path.join(__dirname, 'test.thrift')},
                getText: () => testCase.input,
                lineAt: (i) => {
                    const lines = testCase.input.split('\n');
                    return {text: lines[i] || ''};
                }
            };

            const fullRange = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(1000, 0));
            const edits = await provider.provideDocumentRangeFormattingEdits(document, fullRange, {
                tabSize: 2,
                insertSpaces: true,
                indentSize: 2
            }, {});

            assert.ok(Array.isArray(edits), 'Should return edits array');

            let formattedText = document.getText();
            for (const edit of edits) {
                const lines = formattedText.split('\n');
                const startLine = edit.range.start.line;
                const endLine = edit.range.end.line;

                lines.splice(startLine, endLine - startLine + 1, ...edit.newText.split('\n'));
                formattedText = lines.join('\n');
            }

            const formattedLines = formattedText.split('\n');
            const paramLines = formattedLines.filter(line => /^\s*\d+:\s*/.test(line));

            assert.ok(paramLines.length > 0, 'Should find parameter lines');

            for (const paramLine of paramLines) {
                const actualIndent = paramLine.match(/^(\s*)/)[1].length;
                assert.strictEqual(
                    actualIndent,
                    testCase.expectedParamIndent,
                    `Parameter line "${paramLine.trim()}" should have ${testCase.expectedParamIndent} spaces, got ${actualIndent}`
                );
            }
        });
    });
});
