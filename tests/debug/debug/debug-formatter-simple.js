const fs = require('fs');
const path = require('path');

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
const {ThriftFormattingProvider} = require('../out/formatting-provider.js');

async function debugFormat() {
    const input = `struct User{1:i32 id;2:string name;}`;
    const tempFile = 'test-files/debug-format.temp.thrift';
    
    // 确保测试目录存在
    const testDir = path.dirname(tempFile);
    if (!fs.existsSync(testDir)) {
        fs.mkdirSync(testDir, { recursive: true });
    }
    
    fs.writeFileSync(tempFile, input);
    
    try {
        const provider = new ThriftFormattingProvider();
        const uri = vscode.Uri.file(path.resolve(tempFile));
        const document = await vscode.workspace.openTextDocument(uri);
        
        console.log('原始内容:');
        console.log(document.getText());
        
        // Use a large range like the working test
        const fullRange = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(1000, 0));
        
        console.log('请求格式化...');
        const edits = await provider.provideDocumentRangeFormattingEdits(
            document, 
            fullRange, 
            {
                tabSize: 4,
                insertSpaces: true
            }, 
            {}
        );
        
        console.log('格式化结果:');
        console.log('编辑数量:', edits ? edits.length : 0);
        if (edits) {
            edits.forEach((edit, i) => {
                console.log(`编辑 ${i + 1}:`, {
                    range: {
                        start: {line: edit.range.start.line, character: edit.range.start.character},
                        end: {line: edit.range.end.line, character: edit.range.end.character}
                    },
                    newText: edit.newText
                });
            });
        }
        
        // 应用编辑到文本
        let formattedText = document.getText();
        if (edits && edits.length > 0) {
            console.log('应用编辑...');
            // 按位置倒序应用编辑（避免位置偏移问题）
            edits.sort((a, b) => {
                const aStart = a.range.start.line * 10000 + a.range.start.character;
                const bStart = b.range.start.line * 10000 + b.range.start.character;
                return bStart - aStart;
            });
            
            for (const edit of edits) {
                console.log('处理编辑:', {
                    range: edit.range,
                    newText: edit.newText
                });
                
                const lines = formattedText.split('\n');
                const startLine = edit.range.start.line;
                const endLine = edit.range.end.line;
                const startChar = edit.range.start.character;
                const endChar = edit.range.end.character;
                
                console.log('当前行数:', lines.length);
                console.log('目标范围:', startLine, endLine, startChar, endChar);
                
                if (startLine >= lines.length) {
                    console.log('开始行超出范围');
                    continue;
                }
                
                if (endLine >= lines.length) {
                    console.log('结束行超出范围，调整为最后一行');
                    endLine = lines.length - 1;
                    endChar = lines[endLine].length;
                }
                
                if (startLine === endLine) {
                    // 单行编辑
                    const line = lines[startLine];
                    if (!line) {
                        console.log('行不存在');
                        continue;
                    }
                    console.log('原行:', JSON.stringify(line));
                    const newLine = line.substring(0, startChar) + edit.newText + line.substring(endChar);
                    console.log('新行:', JSON.stringify(newLine));
                    lines[startLine] = newLine;
                } else {
                    // 多行编辑
                    const startText = lines[startLine].substring(0, startChar);
                    const endText = lines[endLine].substring(endChar);
                    const newLines = edit.newText.split('\n');
                    
                    lines[startLine] = startText + newLines[0];
                    lines.splice(startLine + 1, endLine - startLine, ...newLines.slice(1));
                    lines[lines.length - 1] = lines[lines.length - 1] + endText;
                }
                
                formattedText = lines.join('\n');
            }
        }
        
        console.log('最终格式化结果:');
        console.log(JSON.stringify(formattedText));
        
    } catch (error) {
        console.error('错误:', error);
        console.error('堆栈:', error.stack);
    } finally {
        if (fs.existsSync(tempFile)) {
            fs.unlinkSync(tempFile);
        }
        Module._load = originalLoad;
    }
}

debugFormat();