const fs = require('fs');
const path = require('path');

// 复制自 run-all-unified.js 的依赖检查函数
function isBuiltinModule(moduleName) {
    const builtinModules = [
        'assert', 'buffer', 'child_process', 'cluster', 'console', 'constants',
        'crypto', 'dgram', 'dns', 'domain', 'events', 'fs', 'http', 'https',
        'module', 'net', 'os', 'path', 'punycode', 'querystring', 'readline',
        'repl', 'stream', 'string_decoder', 'sys', 'timers', 'tls', 'tty',
        'url', 'util', 'vm', 'zlib'
    ];
    return builtinModules.includes(moduleName);
}

function checkTestDependencies(testFile) {
    try {
        const testPath = path.join(__dirname, 'tests', testFile);
        const content = fs.readFileSync(testPath, 'utf8');
        
        // 匹配require语句
        const requireRegex = /require\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
        const matches = content.matchAll(requireRegex);
        
        for (const match of matches) {
            const modulePath = match[1];
            
            // 跳过内置模块
            if (isBuiltinModule(modulePath)) {
                continue;
            }
            
            // 检查相对路径模块
            if (modulePath.startsWith('.')) {
                const fullPath = path.resolve(__dirname, 'tests', modulePath);
                const possiblePaths = [
                    fullPath,
                    fullPath + '.js',
                    fullPath + '.ts',
                    path.join(fullPath, 'index.js'),
                    path.join(fullPath, 'index.ts'),
                ];
                
                // 检查是否存在
                const exists = possiblePaths.some(p => fs.existsSync(p));
                if (!exists) {
                    return {
                        missing: true,
                        module: modulePath,
                        reason: `Module not found: ${modulePath}`
                    };
                }
            }
            
            // 检查out目录中的模块
            if (modulePath.startsWith('../out/')) {
                // 相对于tests目录的../out/路径
                const outPath = path.resolve(__dirname, modulePath);
                if (!fs.existsSync(outPath)) {
                    return {
                        missing: true,
                        module: modulePath,
                        reason: `Module not found: ${modulePath}`
                    };
                }
            } else if (modulePath.startsWith('./out/')) {
                // 相对于项目根目录的./out/路径
                const outPath = path.resolve(__dirname, '.', modulePath);
                if (!fs.existsSync(outPath)) {
                    return {
                        missing: true,
                        module: modulePath,
                        reason: `Module not found: ${modulePath}`
                    };
                }
            }
        }
        
        return { missing: false };
    } catch (error) {
        return {
            missing: true,
            module: 'unknown',
            reason: `Error reading file: ${error.message}`
        };
    }
}

function getAllTestFiles() {
    const testDir = path.join(__dirname, 'tests');
    const testFiles = [];
    const skippedFiles = [];
    
    // 读取目录中的所有文件
    const files = fs.readdirSync(testDir);
    
    // 筛选测试文件（以test-开头，.js结尾）
    for (const file of files) {
        if (file.startsWith('test-') && file.endsWith('.js')) {
            const deps = checkTestDependencies(file);
            if (deps.missing) {
                skippedFiles.push({
                    file,
                    reason: deps.reason
                });
            } else {
                testFiles.push(file);
            }
        }
    }
    
    // 按字母顺序排序
    testFiles.sort();
    skippedFiles.sort((a, b) => a.file.localeCompare(b.file));
    
    return {
        runnable: testFiles,
        skipped: skippedFiles
    };
}

// 执行并输出结果
const {runnable, skipped} = getAllTestFiles();

console.log('=== 测试文件分析结果 ===');
console.log(`可运行测试文件: ${runnable.length}`);
console.log(`被跳过的测试文件: ${skipped.length}`);
console.log('');

if (skipped.length > 0) {
    console.log('被跳过的测试文件详情:');
    skipped.forEach(({file, reason}, index) => {
        console.log(`${index + 1}. ${file}`);
        console.log(`   原因: ${reason}`);
        console.log('');
    });
}

// 可选：显示可运行的测试文件
if (process.argv.includes('--show-runnable')) {
    console.log('可运行的测试文件:');
    runnable.forEach((file, index) => {
        console.log(`${index + 1}. ${file}`);
    });
}