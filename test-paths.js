const fs = require('fs');
const path = require('path');

// 测试路径解析
const testPaths = [
    '../out/formatting-bridge/index.js',
    './out/formatting-bridge/index.js',
    '../out/formatter/index.js',
    './out/formatter/index.js'
];

console.log('当前工作目录:', __dirname);
console.log('');

testPaths.forEach(testPath => {
    let resolvedPath;
    if (testPath.startsWith('../')) {
        // 相对于tests目录的../out/路径
        resolvedPath = path.resolve(__dirname, 'tests', testPath);
    } else if (testPath.startsWith('./')) {
        // 相对于项目根目录的./out/路径  
        resolvedPath = path.resolve(__dirname, testPath);
    }
    
    console.log(`路径: ${testPath}`);
    console.log(`解析后: ${resolvedPath}`);
    console.log(`存在: ${fs.existsSync(resolvedPath)}`);
    console.log('');
});
