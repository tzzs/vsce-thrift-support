#!/usr/bin/env node

/**
 * 批量修复测试文件中的模块路径错误
 * 将 ../out/ 修复为 ../out/src/
 * 为缺少扩展名的模块添加 .js 扩展名
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
 * 修复模块路径
 */
function fixModulePath(modulePath) {
    let fixedPath = modulePath;
    
    // 规则1: ../out/ -> ../out/src/
    if (fixedPath.startsWith('../out/') && !fixedPath.startsWith('../out/src/')) {
        fixedPath = fixedPath.replace('../out/', '../out/src/');
    }
    
    // 规则2: ./out/ -> ./out/src/
    if (fixedPath.startsWith('./out/') && !fixedPath.startsWith('./out/src/')) {
        fixedPath = fixedPath.replace('./out/', './out/src/');
    }
    
    // 规则3: 为没有扩展名的模块添加 .js 扩展名
    if (!fixedPath.endsWith('.js') && !fixedPath.endsWith('.json') && !fixedPath.includes('.')) {
        // 检查是否是目录（不包含文件扩展名）
        const pathParts = fixedPath.split('/');
        const lastPart = pathParts[pathParts.length - 1];
        
        // 如果不是内置模块且没有扩展名，添加 .js
        const builtinModules = ['fs', 'path', 'child_process', 'util', 'crypto'];
        if (!builtinModules.includes(lastPart)) {
            fixedPath += '.js';
        }
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
 * 获取所有需要修复的测试文件
 */
function getTestFilesToFix() {
    const testDir = __dirname;
    const files = fs.readdirSync(testDir);
    const testFiles = [];
    
    for (const file of files) {
        if (file.startsWith('test-') && file.endsWith('.js')) {
            const filePath = path.join(testDir, file);
            const content = fs.readFileSync(filePath, 'utf8');
            
            // 检查是否包含需要修复的路径
            if (content.includes('../out/') && !content.includes('../out/src/')) {
                testFiles.push(file);
            } else if (content.includes('./out/') && !content.includes('./out/src/')) {
                testFiles.push(file);
            } else if (content.match(/require\s*\(\s*['"`]\.[\.\/]+\/out\/[^'"`]+['"`]\s*\)/)) {
                // 匹配任何需要修复的 out 路径
                testFiles.push(file);
            }
        }
    }
    
    return testFiles;
}

/**
 * 主函数
 */
function main() {
    console.log(`${COLORS.CYAN}${ICONS.INFO} 开始修复测试文件中的模块路径错误...${COLORS.RESET}\n`);
    
    const testFiles = getTestFilesToFix();
    
    if (testFiles.length === 0) {
        console.log(`${COLORS.YELLOW}${ICONS.WARNING} 没有找到需要修复的测试文件${COLORS.RESET}`);
        return;
    }
    
    console.log(`${COLORS.CYAN}发现 ${testFiles.length} 个需要修复的测试文件${COLORS.RESET}\n`);
    
    let fixedCount = 0;
    
    for (const testFile of testFiles) {
        if (fixTestFile(testFile)) {
            fixedCount++;
        }
    }
    
    console.log(`\n${COLORS.GREEN}${ICONS.SUCCESS} 修复完成！共修复 ${fixedCount} 个文件${COLORS.RESET}`);
    
    if (fixedCount < testFiles.length) {
        console.log(`${COLORS.YELLOW}${ICONS.WARNING} 有 ${testFiles.length - fixedCount} 个文件修复失败${COLORS.RESET}`);
    }
}

// 运行主程序
if (require.main === module) {
    main();
}

module.exports = { fixModulePath, fixTestFile };