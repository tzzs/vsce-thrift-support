// Mock vscode module before requiring formatter
const Module = require('module');
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
    }
};

require.cache['vscode'] = { exports: vscode };

const { ThriftFormattingProvider } = require('./out/formatter');

// Restore original resolver
Module._resolveFilename = originalResolveFilename;

// 用户反馈的问题代码
const problemCode = `// Constants
const i32 MAX_USERS = 10000
const string DEFAULT_NAMESPACE = "com.example"
const list<string> SUPPORTED_LANGUAGES = ["java", "python", "cpp", "javascript"]
const map<string, i32> ERROR_CODES = {
"NOT_FOUND": 404,
"VALIDATION_ERROR": 400,
"INTERNAL_ERROR": 500
}`;

console.log('用户反馈的问题代码:');
console.log(problemCode);
console.log('\n' + '='.repeat(60) + '\n');

// 当前example.thrift中的正确代码
const correctCode = `// Constants
const i32 MAX_USERS = 10000
const string DEFAULT_NAMESPACE = "com.example"
const list<string> SUPPORTED_LANGUAGES = ["java", "python", "cpp", "javascript"]
const map<string, i32> ERROR_CODES = {
    "NOT_FOUND": 404,
    "VALIDATION_ERROR": 400,
    "INTERNAL_ERROR": 500
}`;

console.log('当前example.thrift中的正确代码:');
console.log(correctCode);
console.log('\n' + '='.repeat(60) + '\n');

try {
    const formatter = new ThriftFormattingProvider();
    
    console.log('测试1: 格式化问题代码');
    const formatted1 = formatter.formatThriftCode(problemCode, { insertSpaces: true, tabSize: 4 });
    console.log('结果:');
    console.log(formatted1);
    
    // 检查缩进
    const lines1 = formatted1.split('\n');
    const mapLines1 = lines1.filter(line => line.includes('"NOT_FOUND"') || line.includes('"VALIDATION_ERROR"') || line.includes('"INTERNAL_ERROR"'));
    console.log('\nmap值缩进检查:');
    mapLines1.forEach(line => {
        const indent = line.match(/^(\s*)/)[1].length;
        console.log(`"${line.trim()}" -> ${indent}个空格`);
    });
    
    console.log('\n' + '='.repeat(60) + '\n');
    
    console.log('测试2: 格式化正确代码');
    const formatted2 = formatter.formatThriftCode(correctCode, { insertSpaces: true, tabSize: 4 });
    console.log('结果:');
    console.log(formatted2);
    
    // 检查缩进
    const lines2 = formatted2.split('\n');
    const mapLines2 = lines2.filter(line => line.includes('"NOT_FOUND"') || line.includes('"VALIDATION_ERROR"') || line.includes('"INTERNAL_ERROR"'));
    console.log('\nmap值缩进检查:');
    mapLines2.forEach(line => {
        const indent = line.match(/^(\s*)/)[1].length;
        console.log(`"${line.trim()}" -> ${indent}个空格`);
    });
    
    // 比较结果
    console.log('\n' + '='.repeat(60) + '\n');
    console.log('结果比较:');
    console.log('问题代码格式化后是否正确:', formatted1 === formatted2 ? '是' : '否');
    if (formatted1 !== formatted2) {
        console.log('\n差异分析:');
        const diff1Lines = formatted1.split('\n');
        const diff2Lines = formatted2.split('\n');
        for (let i = 0; i < Math.max(diff1Lines.length, diff2Lines.length); i++) {
            const line1 = diff1Lines[i] || '';
            const line2 = diff2Lines[i] || '';
            if (line1 !== line2) {
                console.log(`第${i+1}行差异:`);
                console.log(`  问题代码: "${line1}"`);
                console.log(`  正确代码: "${line2}"`);
            }
        }
    }
    
} catch (error) {
    console.error('格式化出错:', error.message);
    console.error(error.stack);
}