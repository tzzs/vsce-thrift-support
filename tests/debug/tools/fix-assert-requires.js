/**
 * 修复测试文件中的 assert 模块引用错误
 * 将 require('assert.js') 改为 require('assert')
 */

const fs = require('fs');
const path = require('path');

/**
 * 修复单个文件中的 assert 引用
 */
function fixAssertRequires(filePath) {
    console.log(`修复文件: ${path.basename(filePath)}`);
    
    let content = fs.readFileSync(filePath, 'utf8');
    let modified = false;
    
    // 替换 require('assert.js') 为 require('assert')
    const newContent = content.replace(/require\(['"]assert\.js['"]\)/g, "require('assert')");
    
    if (newContent !== content) {
        modified = true;
        fs.writeFileSync(filePath, newContent, 'utf8');
        console.log(`  ✅ 已修复 assert 引用`);
    } else {
        console.log(`  ℹ️  无需修复`);
    }
    
    return modified;
}

/**
 * 获取所有需要修复的测试文件
 */
function getFilesToFix() {
    const testDir = __dirname;
    const files = fs.readdirSync(testDir)
        .filter(file => file.startsWith('test-') && file.endsWith('.js'))
        .map(file => path.join(testDir, file));
    
    return files.filter(file => {
        const content = fs.readFileSync(file, 'utf8');
        return content.includes("require('assert.js')");
    });
}

/**
 * 主函数
 */
function main() {
    console.log('🔧 开始修复 assert 模块引用...\n');
    
    const filesToFix = getFilesToFix();
    console.log(`找到 ${filesToFix.length} 个需要修复的文件\n`);
    
    let fixedCount = 0;
    filesToFix.forEach(file => {
        if (fixAssertRequires(file)) {
            fixedCount++;
        }
    });
    
    console.log(`\n✅ 修复完成！共修复 ${fixedCount} 个文件`);
}

// 运行主函数
if (require.main === module) {
    main();
}

module.exports = { fixAssertRequires, getFilesToFix };