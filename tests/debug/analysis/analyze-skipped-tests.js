#!/usr/bin/env node

/**
 * 分析被跳过的测试文件及其原因
 */

const fs = require('fs');
const path = require('path');

// 颜色常量
const COLORS = {
    RESET: '\x1b[0m',
    RED: '\x1b[31m',
    GREEN: '\x1b[32m',
    YELLOW: '\x1b[33m',
    CYAN: '\x1b[36m',
    DIM: '\x1b[2m'
};

/**
 * 检查测试文件的依赖模块是否存在（复用统一运行器的逻辑）
 */
function checkTestDependencies(testFile) {
    try {
        const testPath = path.join(__dirname, testFile);
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
                const fullPath = path.resolve(__dirname, modulePath);
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
            if (modulePath.includes('../out/')) {
                const outPath = path.resolve(__dirname, modulePath);
                if (!fs.existsSync(outPath) && !fs.existsSync(outPath + '.js')) {
                    return {
                        missing: true,
                        module: modulePath,
                        reason: `Compiled module not found: ${modulePath}. Try running 'npm run compile' first.`
                    };
                }
            }
        }
        
        return { missing: false };
    } catch (error) {
        return {
            missing: true,
            module: testFile,
            reason: `Failed to check dependencies: ${error.message}`
        };
    }
}

/**
 * 检查是否为Node.js内置模块
 */
function isBuiltinModule(moduleName) {
    const builtins = [
        'assert', 'buffer', 'child_process', 'cluster', 'crypto', 'dgram', 'dns', 'domain',
        'events', 'fs', 'http', 'https', 'net', 'os', 'path', 'punycode', 'querystring',
        'readline', 'stream', 'string_decoder', 'tls', 'tty', 'url', 'util', 'v8', 'vm', 'zlib'
    ];
    return builtins.includes(moduleName);
}

/**
 * 获取所有测试文件，并分析被跳过的原因
 */
function analyzeSkippedTests() {
    const testDir = __dirname;
    const skippedFiles = [];
    
    // 读取目录中的所有文件
    const files = fs.readdirSync(testDir);
    
    console.log(`${COLORS.CYAN}分析测试文件依赖关系...${COLORS.RESET}\n`);
    
    // 筛选测试文件（以test-开头，.js结尾）
    for (const file of files) {
        if (file.startsWith('test-') && file.endsWith('.js')) {
            const deps = checkTestDependencies(file);
            if (deps.missing) {
                skippedFiles.push({
                    file,
                    reason: deps.reason,
                    module: deps.module
                });
            }
        }
    }
    
    // 按原因分类
    const categories = {};
    skippedFiles.forEach(item => {
        if (item.reason.includes('Compiled module not found')) {
            if (!categories.compile) {categories.compile = [];}
            categories.compile.push(item);
        } else if (item.reason.includes('Module not found')) {
            if (!categories.missing) {categories.missing = [];}
            categories.missing.push(item);
        } else {
            if (!categories.other) {categories.other = [];}
            categories.other.push(item);
        }
    });
    
    // 显示结果
    console.log(`${COLORS.YELLOW}发现 ${skippedFiles.length} 个被跳过的测试文件：${COLORS.RESET}\n`);
    
    // 显示分类统计
    if (categories.compile) {
        console.log(`${COLORS.RED}🔧 需要编译的模块 (${categories.compile.length}个)：${COLORS.RESET}`);
        categories.compile.forEach(item => {
            console.log(`  ${COLORS.DIM}• ${item.file}${COLORS.RESET}`);
            console.log(`    ${COLORS.YELLOW}原因: ${item.reason}${COLORS.RESET}`);
        });
        console.log();
    }
    
    if (categories.missing) {
        console.log(`${COLORS.RED}📦 缺失依赖模块 (${categories.missing.length}个)：${COLORS.RESET}`);
        categories.missing.forEach(item => {
            console.log(`  ${COLORS.DIM}• ${item.file}${COLORS.RESET}`);
            console.log(`    ${COLORS.YELLOW}原因: ${item.reason}${COLORS.RESET}`);
        });
        console.log();
    }
    
    if (categories.other) {
        console.log(`${COLORS.RED}❓ 其他问题 (${categories.other.length}个)：${COLORS.RESET}`);
        categories.other.forEach(item => {
            console.log(`  ${COLORS.DIM}• ${item.file}${COLORS.RESET}`);
            console.log(`    ${COLORS.YELLOW}原因: ${item.reason}${COLORS.RESET}`);
        });
        console.log();
    }
    
    // 提供解决建议
    console.log(`${COLORS.CYAN}💡 解决建议：${COLORS.RESET}`);
    if (categories.compile) {
        console.log(`  1. 运行 ${COLORS.GREEN}npm run compile${COLORS.RESET} 编译TypeScript文件`);
    }
    if (categories.missing) {
        console.log(`  2. 检查缺失的模块路径是否正确`);
        console.log(`  3. 运行 ${COLORS.GREEN}npm install${COLORS.RESET} 安装依赖包`);
    }
    
    return skippedFiles;
}

// 运行分析
analyzeSkippedTests();