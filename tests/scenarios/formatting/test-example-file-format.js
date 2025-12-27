// 直接测试 example.thrift 文件的格式化
const path = require('path');
const fs = require('fs');

// Mock minimal VS Code API used by the formatter
const {createVscodeMock, installVscodeMock} = require('../../test-helpers/vscode-mock');
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
const {ThriftFormattingProvider} = require('../../../out/src/formattingProvider.js');

async function testExampleFileFormatting() {
    console.log('=== 直接测试 example.thrift 文件格式化 ===\n');

    const provider = new ThriftFormattingProvider();

    // 直接测试 example.thrift 文件
    const examplePath = path.join(__dirname, '..', '..', 'test-files', 'example.thrift');
    const exampleUri = vscode.Uri.file(examplePath);
    const doc = await vscode.workspace.openTextDocument(exampleUri);

    console.log('原始文件内容:');
    const originalText = doc.getText();
    const lines = originalText.split('\n');

    // 显示相关行
    for (let i = 130; i <= 145 && i < lines.length; i++) {
        console.log(`${i + 1}: "${lines[i]}"`);
    }

    const fullRange = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(lines.length, 0));
    // 使用标准的缩进配置：2空格缩进，匹配Apache Thrift官方标准
    const formattingOptions = {tabSize: 2, insertSpaces: true, indentSize: 2};
    console.log('格式化选项:', formattingOptions);
    const edits = await provider.provideDocumentRangeFormattingEdits(doc, fullRange, formattingOptions, {});

    console.log('\n格式化编辑结果:');
    console.log(`编辑数量: ${edits.length}`);

    if (edits.length === 0) {
        console.log('没有需要格式化的更改');
        return;
    }

    // 应用编辑
    let formattedText = originalText;
    for (const edit of edits) {
        const textLines = formattedText.split('\n');
        const startLine = edit.range.start.line;
        const endLine = edit.range.end.line;

        console.log(`编辑范围: ${startLine + 1}-${endLine + 1}`);
        console.log(`新内容: "${edit.newText.replace(/\n/g, '\n             ')}"`);

        textLines.splice(startLine, endLine - startLine + 1, ...edit.newText.split('\n'));
        formattedText = textLines.join('\n');
    }

    console.log('\n格式化后内容:');
    const formattedLines = formattedText.split('\n');
    for (let i = 130; i <= 145 && i < formattedLines.length; i++) {
        console.log(`${i + 1}: "${formattedLines[i]}"`);
    }

    // 检查服务方法缩进是否符合Apache Thrift官方标准（2空格）
    console.log('\n服务缩进检查 (Apache Thrift官方标准 - 2空格):');
    const serviceStartLine = formattedLines.findIndex(line => line.includes('service TestService'));

    let methodFound = false;
    let paramFound = false;

    for (let i = serviceStartLine; i < formattedLines.length; i++) {
        const line = formattedLines[i];

        // 检查方法行（应该2空格缩进）
        if (line.includes('PingResponse Ping(')) {
            const match = line.match(/^(\s*)/);
            const indent = match ? match[1].length : 0;
            console.log(`方法行: "${line}" -> 缩进: ${indent} 空格 ${indent === 2 ? '✅' : '❌'}`);
            methodFound = true;
        }

        // 检查参数行（应该4空格缩进，比方法多2空格）
        if (/^\s*\d+:\s*/.test(line)) {
            const match = line.match(/^(\s*)/);
            const indent = match ? match[1].length : 0;
            console.log(`参数行: "${line}" -> 缩进: ${indent} 空格 ${indent === 4 ? '✅' : '❌'}`);
            paramFound = true;
        }

        // 检查注释行（应该2空格缩进）
        if (line.includes('// ping')) {
            const match = line.match(/^(\s*)/);
            const indent = match ? match[1].length : 0;
            console.log(`注释行: "${line}" -> 缩进: ${indent} 空格 ${indent === 2 ? '✅' : '❌'}`);
        }

        if (line.includes('}') && !line.includes('PingResponse')) {
            break; // 结束检查
        }
    }

    if (methodFound && paramFound) {
        console.log('\n✅ 服务缩进格式正确，符合Apache Thrift官方标准（2空格）');
    } else {
        console.log('\n❌ 服务缩进格式检查失败');
    }
}

// 运行测试
(async function run() {
    try {
        await testExampleFileFormatting();
    } catch (error) {
        console.error('测试执行失败:', error);
        console.error(error.stack);
    }
})();