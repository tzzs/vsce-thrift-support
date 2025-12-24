// 详细分析缩进级别问题
const path = require('path');
const fs = require('fs');

// Mock minimal VS Code API used by the formatter
const vscode = {
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
};

// Mock require('vscode') inside formatter
const Module = require('module');
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
    if (request === 'vscode') {
        return vscode;
    }
    return originalLoad.apply(this, arguments);
};

// Import the formatter provider (compiled output)
const {ThriftFormattingProvider} = require('../out/src/formattingProvider.js');

// 测试用例：分析期望 vs 实际的缩进级别
const testCode = `service TestService {
    // ping
    PingResponse Ping(
    1: required trace.Trace traceInfo,
    2: required PingRequest request
    )
}`;

async function analyzeIndentation() {
    console.log('=== 缩进级别详细分析 ===\n');

    const provider = new ThriftFormattingProvider();

    // 创建临时测试文件
    const tempFilePath = path.join(__dirname, 'temp-indent-analysis.thrift');
    fs.writeFileSync(tempFilePath, testCode);

    try {
        const testUri = vscode.Uri.file(tempFilePath);
        const doc = await vscode.workspace.openTextDocument(testUri);

        const fullRange = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(1000, 0));
        const edits = await provider.provideDocumentRangeFormattingEdits(doc, fullRange, {
            tabSize: 2,
            insertSpaces: true
        }, {});

        // 应用编辑
        let formattedText = doc.getText();
        for (const edit of edits) {
            const lines = formattedText.split('\n');
            const startLine = edit.range.start.line;
            const endLine = edit.range.end.line;
            lines.splice(startLine, endLine - startLine + 1, ...edit.newText.split('\n'));
            formattedText = lines.join('\n');
        }

        console.log('原始代码:');
        const originalLines = testCode.split('\n');
        originalLines.forEach((line, i) => {
            const match = line.match(/^(\s*)/);
            const indent = match ? match[1].length : 0;
            console.log(`${i + 1}: [${indent}] "${line}"`);
        });

        console.log('\n格式化后代码:');
        const formattedLines = formattedText.split('\n');
        formattedLines.forEach((line, i) => {
            const match = line.match(/^(\s*)/);
            const indent = match ? match[1].length : 0;
            console.log(`${i + 1}: [${indent}] "${line}"`);
        });

        console.log('\n期望的代码:');
        const expectedCode = `service TestService {
  // ping
  PingResponse Ping(
    1: required trace.Trace traceInfo,
    2: required PingRequest request
  )
}`;
        const expectedLines = expectedCode.split('\n');
        expectedLines.forEach((line, i) => {
            const match = line.match(/^(\s*)/);
            const indent = match ? match[1].length : 0;
            console.log(`${i + 1}: [${indent}] "${line}"`);
        });

        console.log('\n=== 分析结果 ===');
        console.log('原始: service行[4], 方法行[4], 参数行[4]');
        console.log('实际: service行[4], 方法行[4], 参数行[4]');
        console.log('期望: service行[2], 方法行[2], 参数行[4]');

        console.log('\n问题: service和方法名应该使用2空格缩进，而不是4空格');

    } finally {
        if (fs.existsSync(tempFilePath)) {
            fs.unlinkSync(tempFilePath);
        }
    }
}

analyzeIndentation();