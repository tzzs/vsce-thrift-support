// Mock vscode module before requiring formatter
const Module = require('module');
const fs = require('fs');
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

const formatter_module = require('./out/formatter');
const ThriftFormattingProvider = formatter_module.ThriftFormattingProvider;

// Restore original resolver
Module._resolveFilename = originalResolveFilename;

// 用户描述的问题场景：格式化后变成这样
const userReportedResult = `// Constants 
const i32 MAX_USERS = 10000 
const string DEFAULT_NAMESPACE = "com.example" 
const list<string> SUPPORTED_LANGUAGES = ["java", "python", "cpp", "javascript"] 
const map<string, i32> ERROR_CODES = { 
"NOT_FOUND": 404, 
"VALIDATION_ERROR": 400, 
"INTERNAL_ERROR": 500 
}`;

console.log('用户反馈的格式化结果:');
console.log(userReportedResult);
console.log('\n' + '='.repeat(80) + '\n');

// 分析用户反馈结果的缩进
const userLines = userReportedResult.split('\n');
console.log('用户反馈结果的缩进分析:');
userLines.forEach((line, idx) => {
    if (line.includes('"NOT_FOUND"') || line.includes('"VALIDATION_ERROR"') || line.includes('"INTERNAL_ERROR"')) {
        const indent = line.match(/^(\s*)/)[1].length;
        console.log(`第${idx+1}行: "${line.trim()}" -> ${indent}个空格 ${indent === 0 ? '❌ 缺少缩进!' : '✅'}`);
    }
});

console.log('\n' + '='.repeat(80) + '\n');

// 测试各种可能导致缩进丢失的场景
const testScenarios = [
    {
        name: '场景1: 原始无缩进代码',
        code: `// Constants
const map<string, i32> ERROR_CODES = {
"NOT_FOUND": 404,
"VALIDATION_ERROR": 400,
"INTERNAL_ERROR": 500
}`
    },
    {
        name: '场景2: 部分缩进代码',
        code: `// Constants
const map<string, i32> ERROR_CODES = {
  "NOT_FOUND": 404,
"VALIDATION_ERROR": 400,
    "INTERNAL_ERROR": 500
}`
    },
    {
        name: '场景3: 错误缩进代码',
        code: `// Constants
const map<string, i32> ERROR_CODES = {
\t"NOT_FOUND": 404,
  "VALIDATION_ERROR": 400,
      "INTERNAL_ERROR": 500
}`
    },
    {
        name: '场景4: 单行格式',
        code: `const map<string, i32> ERROR_CODES = {"NOT_FOUND": 404, "VALIDATION_ERROR": 400, "INTERNAL_ERROR": 500}`
    }
];

// 定义结果变量
let allCorrect1, allCorrect2, allCorrect3, allCorrect4;

try {
    const formatter = new ThriftFormattingProvider();
    const options = { insertSpaces: true, tabSize: 4 };
    
    testScenarios.forEach((scenario, idx) => {
        console.log(`\n${scenario.name}:`);
        console.log('输入:');
        console.log(scenario.code);
        
        const formatted = formatter.formatThriftCode(scenario.code, options);
        console.log('\n格式化结果:');
        console.log(formatted);
        
        // 检查缩进
        const lines = formatted.split('\n');
        const mapValueLines = lines.filter(line => 
            line.trim() && 
            (line.includes('"NOT_FOUND"') || line.includes('"VALIDATION_ERROR"') || line.includes('"INTERNAL_ERROR"'))
        );
        
        console.log('\n缩进检查:');
        let allCorrect = true;
        mapValueLines.forEach(line => {
            const indent = line.match(/^(\s*)/)[1].length;
            const status = indent >= 4 ? '✅' : '❌';
            console.log(`"${line.trim()}" -> ${indent}个空格 ${status}`);
            if (indent < 4) allCorrect = false;
        });
        
        // 保存每个场景的结果
        if (idx === 0) allCorrect1 = allCorrect;
        else if (idx === 1) allCorrect2 = allCorrect;
        else if (idx === 2) allCorrect3 = allCorrect;
        else if (idx === 3) allCorrect4 = allCorrect;
        
        // 检查是否与用户反馈的问题结果相同
        const hasNoIndent = mapValueLines.some(line => {
            const indent = line.match(/^(\s*)/)[1].length;
            return indent === 0;
        });
        
        if (hasNoIndent) {
            console.log('\n⚠️  发现缩进丢失问题！这可能是用户遇到的情况。');
        }
        
        console.log('\n' + '-'.repeat(60));
    });
    
} catch (error) {
    console.error('格式化出错:', error.message);
    console.error(error.stack);
    // 如果出错，设置所有场景为失败
    allCorrect1 = allCorrect2 = allCorrect3 = allCorrect4 = false;
}



// 场景5: 其他单行集合类型测试
const scenario5 = `const list<string> SIMPLE_LIST = ["a", "b", "c"]
const set<i32> SIMPLE_SET = {1, 2, 3}
const map<string, string> SIMPLE_MAP = {"key1": "value1", "key2": "value2"}
`;

console.log('\n场景5: 其他单行集合类型测试');
console.log('输入:');
console.log(scenario5);

// 重新定义options用于场景5
const options5 = {
    insertSpaces: true,
    tabSize: 4,
    indentSize: 4,
    trailingComma: true,
    typeAlignment: true,
    fieldNameAlignment: true
};

const formatted5 = new ThriftFormattingProvider().formatThriftCode(scenario5, options5);
console.log('\n格式化结果:');
console.log(formatted5);

// 检查缩进
const lines5 = formatted5.split('\n');
const collectionLines = lines5.filter(line => 
    line.trim() && 
    (line.includes('SIMPLE_LIST') || line.includes('SIMPLE_SET') || line.includes('SIMPLE_MAP'))
);

console.log('\n缩进检查:');
let allCorrect5 = true;
collectionLines.forEach(line => {
    const indent = line.match(/^(\s*)/)[1].length;
    const status = indent === 0 ? '✅' : '❌';
    console.log(`"${line.trim()}" -> ${indent}个空格 ${status}`);
    if (indent !== 0) {
        allCorrect5 = false;
    }
});

if (!allCorrect5) {
    console.log('\n⚠️  发现缩进问题！');
}

console.log('\n' + '-'.repeat(60));

console.log('\n' + '='.repeat(80) + '\n');
console.log('总结:');
// 从之前的测试中获取结果变量
const allScenariosCorrect = allCorrect1 && allCorrect2 && allCorrect3 && allCorrect4 && allCorrect5;
if (allScenariosCorrect) {
    console.log('✅ 所有场景格式化正确，修复成功！');
} else {
    console.log('❌ 发现格式化逻辑问题，需要进一步修复');
    console.log('问题场景:', {
        '场景1': typeof allCorrect1 !== 'undefined' ? (allCorrect1 ? '正常' : '异常') : '未测试',
        '场景2': typeof allCorrect2 !== 'undefined' ? (allCorrect2 ? '正常' : '异常') : '未测试',
        '场景3': typeof allCorrect3 !== 'undefined' ? (allCorrect3 ? '正常' : '异常') : '未测试',
        '场景4': typeof allCorrect4 !== 'undefined' ? (allCorrect4 ? '正常' : '异常') : '未测试',
        '场景5': allCorrect5 ? '正常' : '异常'
    });
}
console.log('\n建议:');
console.log('1. 如果所有测试场景都正确格式化，问题可能在VS Code集成层面');
console.log('2. 如果某个场景出现缩进丢失，则需要修复格式化逻辑');
console.log('3. 用户可能需要检查VS Code的格式化设置或重新安装插件');