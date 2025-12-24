#!/usr/bin/env node

/**
 * 批量修复测试文件中的模块路径错误（修复版）
 * 只修复 out 目录相关的路径，不修改内置模块
 */

const fs = require('fs');
const path = require('path');

// 颜色常量
const COLORS = {
    RESET: '\x1b[0m',
    GREEN: '\x1b[32m',
    YELLOW: '\x1b[33m',
    RED: '\x1b[31m',
    CYAN: '\x1b[36m',
};

// 图标常量
const ICONS = {
    SUCCESS: '✅',
    WARNING: '⚠️',
    ERROR: '❌',
    INFO: 'ℹ️',
};

/**
 * Node.js 内置模块列表
 */
const BUILTIN_MODULES = [
    'assert', 'buffer', 'child_process', 'cluster', 'crypto', 'dgram', 'dns', 'domain',
    'events', 'fs', 'http', 'https', 'net', 'os', 'path', 'punycode', 'querystring',
    'readline', 'stream', 'string_decoder', 'tls', 'tty', 'url', 'util', 'v8', 'vm', 'zlib',
    'module', 'vscode'  // 这两个是特殊的，也要保留
];

/**
 * 修复模块路径
 */
function fixModulePath(modulePath) {
    // 如果是内置模块，不做任何修改
    if (BUILTIN_MODULES.includes(modulePath)) {
        return modulePath;
    }
    
    let fixedPath = modulePath;
    
    // 规则1: ../out/ -> ../out/src/
    if (fixedPath.startsWith('../out/') && !fixedPath.startsWith('../out/src/')) {
        fixedPath = fixedPath.replace('../out/', '../out/src/');
    }
    
    // 规则2: ./out/ -> ./out/src/
    if (fixedPath.startsWith('./out/') && !fixedPath.startsWith('./out/src/')) {
        fixedPath = fixedPath.replace('./out/', './out/src/');
    }
    
    // 规则3: 为没有扩展名的 out 模块添加 .js 扩展名
    if (!fixedPath.endsWith('.js') && !fixedPath.endsWith('.json') && 
        (fixedPath.includes('../out/src/') || fixedPath.includes('./out/src/'))) {
        fixedPath += '.js';
    }
    
    return fixedPath;
}

/**
 * 修复单个测试文件
 */
function fixTestFile(testFile) {
    const filePath = path.join(__dirname, testFile);
    
    try {
        let content = fs.readFileSync(filePath, 'utf8');
        let modified = false;
        let changes = [];
        
        // 匹配 require 语句
        const requireRegex = /require\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
        const newContent = content.replace(requireRegex, (match, modulePath) => {
            const fixedPath = fixModulePath(modulePath);
            if (fixedPath !== modulePath) {
                modified = true;
                changes.push(`${modulePath} -> ${fixedPath}`);
                return match.replace(modulePath, fixedPath);
            }
            return match;
        });
        
        if (modified) {
            fs.writeFileSync(filePath, newContent, 'utf8');
            console.log(`${COLORS.GREEN}${ICONS.SUCCESS} 已修复: ${testFile}${COLORS.RESET}`);
            changes.forEach(change => {
                console.log(`  ${COLORS.YELLOW}• ${change}${COLORS.RESET}`);
            });
            return true;
        }
        
        return false;
    } catch (error) {
        console.log(`${COLORS.RED}${ICONS.ERROR} 修复失败: ${testFile} - ${error.message}${COLORS.RESET}`);
        return false;
    }
}

/**
 * 回滚之前的错误修复
 */
function rollbackBadFixes() {
    const testDir = __dirname;
    const files = fs.readdirSync(testDir);
    let rollbackCount = 0;
    
    for (const file of files) {
        if (file.startsWith('test-') && file.endsWith('.js')) {
            const filePath = path.join(testDir, file);
            let content = fs.readFileSync(filePath, 'utf8');
            let modified = false;
            
            // 回滚错误的修改：require('vscode.js') -> require('vscode')
            if (content.includes("require('vscode.js')")) {
                content = content.replace(/require\('vscode\.js'\)/g, "require('vscode')");
                modified = true;
            }
            
            // 回滚错误的修改：require('module.js') -> require('module')
            if (content.includes("require('module.js')")) {
                content = content.replace(/require\('module\.js'\)/g, "require('module')");
                modified = true;
            }
            
            if (content.includes('require("vscode.js")')) {
                content = content.replace(/require\("vscode\.js"\)/g, 'require("vscode")');
                modified = true;
            }
            
            if (content.includes('require("module.js")')) {
                content = content.replace(/require\("module\.js"\)/g, 'require("module")');
                modified = true;
            }
            
            if (modified) {
                fs.writeFileSync(filePath, content, 'utf8');
                rollbackCount++;
                console.log(`${COLORS.YELLOW}${ICONS.WARNING} 回滚: ${file}${COLORS.RESET}`);
            }
        }
    }
    
    return rollbackCount;
}

/**
 * 主函数
 */
function main() {
    console.log(`${COLORS.CYAN}${ICONS.INFO} 开始修复测试文件中的模块路径错误...${COLORS.RESET}\n`);
    
    // 首先回滚之前的错误修复
    const rollbackCount = rollbackBadFixes();
    if (rollbackCount > 0) {
        console.log(`${COLORS.YELLOW}回滚了 ${rollbackCount} 个文件的错误修改${COLORS.RESET}\n`);
    }
    
    // 获取所有测试文件
    const testDir = __dirname;
    const files = fs.readdirSync(testDir);
    const testFiles = [];
    
    for (const file of files) {
        if (file.startsWith('test-') && file.endsWith('.js')) {
            testFiles.push(file);
        }
    }
    
    console.log(`${COLORS.CYAN}发现 ${testFiles.length} 个测试文件${COLORS.RESET}\n`);
    
    let fixedCount = 0;
    
    for (const testFile of testFiles) {
        if (fixTestFile(testFile)) {
            fixedCount++;
        }
    }
    
    console.log(`\n${COLORS.GREEN}${ICONS.SUCCESS} 修复完成！共修复 ${fixedCount} 个文件${COLORS.RESET}`);
    
    if (fixedCount === 0) {
        console.log(`${COLORS.YELLOW}${ICONS.INFO} 没有需要修复的文件${COLORS.RESET}`);
    }
}

// 运行主程序
if (require.main === module) {
    main();
}

module.exports = { fixModulePath, fixTestFile };