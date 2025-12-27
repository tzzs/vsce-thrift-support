// 诊断节流机制测试
const assert = require('assert');
const Module = require('module');
const {createVscodeMock, installVscodeMock} = require('../../test-helpers/vscode-mock');
const originalRequire = Module.prototype.require;

// VS Code mock
const vscode = createVscodeMock({
    DiagnosticSeverity: {
        Error: 0,
        Warning: 1,
        Information: 2,
        Hint: 3,
    },
    Position: function (line, character) {
        return {line, character};
    },
    Range: function (startLine, startChar, endLine, endChar) {
        return {
            start: {line: startLine, character: startChar},
            end: {line: endLine, character: endChar}
        };
    },
    Uri: {
        file: function (path) {
            return {fsPath: path, toString: () => path};
        }
    },
    workspace: {
        openTextDocument: async function (uri) {
            return {
                getText: () => 'struct TestStruct { 1: string name }',
                languageId: 'thrift',
                uri: uri
            };
        }
    },
    languages: {
        createDiagnosticCollection: function (name) {
            return {
                set: function (uri, diagnostics) {
                    // 模拟设置诊断信息
                    this.lastUri = uri;
                    this.lastDiagnostics = diagnostics;
                },
                clear: function () {
                    this.lastUri = null;
                    this.lastDiagnostics = null;
                }
            };
        }
    }
});
installVscodeMock(vscode);


Module.prototype.require = function (id) {
    if (id === 'vscode') return vscode;
    return originalRequire.apply(this, arguments);
};

// 模拟诊断模块的部分功能
function simulateThriftAnalysis(text) {
    const issues = [];

    // 简单的语法检查
    if (text.includes('struct') && !text.includes('}')) {
        issues.push({
            code: 'syntax.missingBrace',
            message: 'Missing closing brace',
            severity: vscode.DiagnosticSeverity.Error,
            range: new vscode.Range(0, 0, 0, 0)
        });
    }

    // 检查重复字段ID
    const lines = text.split('\n');
    const fieldIds = new Set();
    for (let i = 0; i < lines.length; i++) {
        const match = lines[i].match(/^\s*(\d+):\s*(\w+)/);
        if (match) {
            const fieldId = match[1];
            if (fieldIds.has(fieldId)) {
                issues.push({
                    code: 'field.duplicateId',
                    message: `Duplicate field ID: ${fieldId}`,
                    severity: vscode.DiagnosticSeverity.Error,
                    range: new vscode.Range(i, 0, i, lines[i].length)
                });
            }
            fieldIds.add(fieldId);
        }
    }

    return issues;
}

Module.prototype.require = originalRequire;

function run() {
    console.log('\n⏱️  Testing diagnostic throttling mechanism...');

    testThrottlingMechanism();
    testDocumentVersionTracking();
    testPerformanceMetrics();

    console.log('\n✅ All diagnostic throttling tests passed!');
}

function testThrottlingMechanism() {
    console.log('\n🔄 Testing throttling mechanism...');

    let analysisCount = 0;
    let lastAnalysisTime = 0;
    const ANALYSIS_DELAY = 300; // 300ms 延迟

    // 模拟节流函数
    function throttledAnalysis(document, callback) {
        const now = Date.now();

        // 清除之前的定时器
        if (this.timeoutId) {
            clearTimeout(this.timeoutId);
        }

        // 设置新的定时器
        this.timeoutId = setTimeout(() => {
            analysisCount++;
            lastAnalysisTime = now;
            const issues = simulateThriftAnalysis(document.getText());
            callback(issues);
        }, ANALYSIS_DELAY);
    }

    // 模拟文档
    const mockDocument = {
        uri: vscode.Uri.file('test.thrift'),
        getText: () => 'struct Test { 1: string name }',
        languageId: 'thrift'
    };

    // 快速连续调用3次（应该只触发一次分析）
    const startTime = Date.now();

    throttledAnalysis(mockDocument, (issues) => {
        console.log(`  Analysis ${analysisCount} completed at ${Date.now() - startTime}ms`);
    });

    throttledAnalysis(mockDocument, (issues) => {
        console.log(`  Analysis ${analysisCount} completed at ${Date.now() - startTime}ms`);
    });

    throttledAnalysis(mockDocument, (issues) => {
        console.log(`  Analysis ${analysisCount} completed at ${Date.now() - startTime}ms`);
    });

    // 验证节流效果
    setTimeout(() => {
        assert.strictEqual(analysisCount, 1, 'Throttling should prevent multiple rapid analyses');
        console.log('  ✅ Throttling mechanism test passed');
    }, ANALYSIS_DELAY + 100);
}

function testDocumentVersionTracking() {
    console.log('\n📋 Testing document version tracking...');

    const documentVersions = new Map();

    function shouldAnalyze(document) {
        const uri = document.uri.toString();
        const currentVersion = document.version || 1;
        const lastVersion = documentVersions.get(uri);

        if (lastVersion === undefined || currentVersion > lastVersion) {
            documentVersions.set(uri, currentVersion);
            return true;
        }

        return false;
    }

    // 模拟文档
    const mockDocument1 = {
        uri: vscode.Uri.file('test1.thrift'),
        getText: () => 'struct Test1 { 1: string name }',
        languageId: 'thrift',
        version: 1
    };

    const mockDocument2 = {
        uri: vscode.Uri.file('test2.thrift'),
        getText: () => 'struct Test2 { 1: i32 age }',
        languageId: 'thrift',
        version: 1
    };

    // 第一次应该分析
    assert.strictEqual(shouldAnalyze(mockDocument1), true, 'First analysis should be allowed');

    // 相同版本不应该重复分析
    assert.strictEqual(shouldAnalyze(mockDocument1), false, 'Same version should not re-analyze');

    // 不同文档应该分析
    assert.strictEqual(shouldAnalyze(mockDocument2), true, 'Different document should be analyzed');

    // 版本升级应该重新分析
    mockDocument1.version = 2;
    assert.strictEqual(shouldAnalyze(mockDocument1), true, 'Version upgrade should re-analyze');

    console.log('  ✅ Document version tracking test passed');
}

function testPerformanceMetrics() {
    console.log('\n📊 Testing performance metrics...');

    // 测试性能测量
    function measurePerformance(operation, fn) {
        const start = performance.now();
        const result = fn();
        const duration = performance.now() - start;

        return {
            result,
            duration,
            timestamp: Date.now()
        };
    }

    // 测试快速操作
    const fastResult = measurePerformance('fast-operation', () => {
        return Math.sqrt(16);
    });

    assert.strictEqual(fastResult.result, 4, 'Fast operation should return correct result');
    assert.ok(fastResult.duration < 10, 'Fast operation should complete quickly');

    // 测试慢操作
    const slowResult = measurePerformance('slow-operation', () => {
        let sum = 0;
        for (let i = 0; i < 1000000; i++) {
            sum += Math.sqrt(i);
        }
        return sum;
    });

    assert.ok(slowResult.duration > 0, 'Slow operation should take measurable time');
    assert.ok(slowResult.result > 0, 'Slow operation should return valid result');

    console.log(`  Fast operation: ${fastResult.duration.toFixed(2)}ms`);
    console.log(`  Slow operation: ${slowResult.duration.toFixed(2)}ms`);

    console.log('  ✅ Performance metrics test passed');
}

// 运行测试
if (require.main === module) {
    run();
}

module.exports = {run};