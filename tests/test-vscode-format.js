// Mock vscode module before requiring formatter
const Module = require('module');
const fs = require('fs');
const path = require('path');
const originalResolveFilename = Module._resolveFilename;

Module._resolveFilename = function (request, parent, isMain) {
    if (request === 'vscode') {
        return 'vscode';
    }
    return originalResolveFilename(request, parent, isMain);
};

const vscode = {
    TextEdit: {
        replace: (range, text) => ({ range, newText: text })
    },
    Range: function(startLine, startChar, endLine, endChar) {
        return { start: { line: startLine, character: startChar }, end: { line: endLine, character: endChar } };
    },
    workspace: {
        getConfiguration: () => ({
            get: (key) => {
                const config = {
                    'thrift.format.indentSize': 4,
                    'thrift.format.alignTypes': true,
                    'thrift.format.alignFieldNames': true
                };
                return config[key];
            }
        })
    }
};

require.cache['vscode'] = { exports: vscode };

const { ThriftFormattingProvider } = require('./out/formatter');

// Restore original resolver
Module._resolveFilename = originalResolveFilename;

// 读取当前example.thrift文件内容
const examplePath = path.join(__dirname, 'example.thrift');
const currentContent = fs.readFileSync(examplePath, 'utf8');

console.log('当前example.thrift文件内容:');
console.log(currentContent);
console.log('\n' + '='.repeat(80) + '\n');

// 提取ERROR_CODES部分
const lines = currentContent.split('\n');
let errorCodesStart = -1;
let errorCodesEnd = -1;

for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('ERROR_CODES')) {
        errorCodesStart = i;
        // 找到对应的结束括号
        let braceCount = 0;
        let foundOpenBrace = false;
        for (let j = i; j < lines.length; j++) {
            const line = lines[j];
            for (let k = 0; k < line.length; k++) {
                if (line[k] === '{') {
                    braceCount++;
                    foundOpenBrace = true;
                } else if (line[k] === '}') {
                    braceCount--;
                    if (foundOpenBrace && braceCount === 0) {
                        errorCodesEnd = j;
                        break;
                    }
                }
            }
            if (errorCodesEnd !== -1) break;
        }
        break;
    }
}

if (errorCodesStart !== -1 && errorCodesEnd !== -1) {
    const errorCodesSection = lines.slice(errorCodesStart, errorCodesEnd + 1).join('\n');
    console.log('当前ERROR_CODES部分 (第' + (errorCodesStart + 1) + '-' + (errorCodesEnd + 1) + '行):');
    console.log(errorCodesSection);
    
    // 检查当前缩进
    console.log('\n当前ERROR_CODES值的缩进分析:');
    for (let i = errorCodesStart + 1; i <= errorCodesEnd - 1; i++) {
        const line = lines[i];
        if (line.trim() && line.includes('"')) {
            const indent = line.match(/^(\s*)/)[1].length;
            console.log(`第${i+1}行: "${line.trim()}" -> ${indent}个空格`);
        }
    }
} else {
    console.log('未找到ERROR_CODES部分');
}

console.log('\n' + '='.repeat(80) + '\n');

// 测试格式化整个文件
try {
    const formatter = new ThriftFormattingProvider();
    const options = { insertSpaces: true, tabSize: 4 };
    
    console.log('执行格式化...');
    const formatted = formatter.formatThriftCode(currentContent, options);
    
    console.log('格式化后的完整内容:');
    console.log(formatted);
    
    console.log('\n' + '='.repeat(80) + '\n');
    
    // 分析格式化后的ERROR_CODES部分
    const formattedLines = formatted.split('\n');
    let formattedErrorCodesStart = -1;
    let formattedErrorCodesEnd = -1;
    
    for (let i = 0; i < formattedLines.length; i++) {
        if (formattedLines[i].includes('ERROR_CODES')) {
            formattedErrorCodesStart = i;
            // 找到对应的结束括号
            let braceCount = 0;
            let foundOpenBrace = false;
            for (let j = i; j < formattedLines.length; j++) {
                const line = formattedLines[j];
                for (let k = 0; k < line.length; k++) {
                    if (line[k] === '{') {
                        braceCount++;
                        foundOpenBrace = true;
                    } else if (line[k] === '}') {
                        braceCount--;
                        if (foundOpenBrace && braceCount === 0) {
                            formattedErrorCodesEnd = j;
                            break;
                        }
                    }
                }
                if (formattedErrorCodesEnd !== -1) break;
            }
            break;
        }
    }
    
    if (formattedErrorCodesStart !== -1 && formattedErrorCodesEnd !== -1) {
        const formattedErrorCodesSection = formattedLines.slice(formattedErrorCodesStart, formattedErrorCodesEnd + 1).join('\n');
        console.log('格式化后ERROR_CODES部分:');
        console.log(formattedErrorCodesSection);
        
        console.log('\n格式化后ERROR_CODES值的缩进分析:');
        for (let i = formattedErrorCodesStart + 1; i <= formattedErrorCodesEnd - 1; i++) {
            const line = formattedLines[i];
            if (line.trim() && line.includes('"')) {
                const indent = line.match(/^(\s*)/)[1].length;
                console.log(`第${i+1}行: "${line.trim()}" -> ${indent}个空格`);
            }
        }
        
        // 检查是否有缩进问题
        const hasIndentIssue = formattedLines.slice(formattedErrorCodesStart + 1, formattedErrorCodesEnd).some(line => {
            return line.trim() && line.includes('"') && !line.startsWith('    ');
        });
        
        console.log('\n缩进问题检查:', hasIndentIssue ? '发现问题！' : '正常');
        
        if (hasIndentIssue) {
            console.log('\n问题详情:');
            formattedLines.slice(formattedErrorCodesStart + 1, formattedErrorCodesEnd).forEach((line, idx) => {
                if (line.trim() && line.includes('"') && !line.startsWith('    ')) {
                    console.log(`第${formattedErrorCodesStart + 2 + idx}行缺少缩进: "${line}"`);
                }
            });
        }
    }
    
} catch (error) {
    console.error('格式化出错:', error.message);
    console.error(error.stack);
}