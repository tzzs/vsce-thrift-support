#!/usr/bin/env node

/**
 * 验证 Thrift Support 插件安装和功能的脚本
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🔍 验证 Thrift Support 插件安装...');
console.log('=' .repeat(50));

// 1. 检查编译输出
console.log('\n1. 检查编译输出:');
const outDir = path.join(__dirname, 'out');
if (fs.existsSync(outDir)) {
    const files = fs.readdirSync(outDir);
    console.log('✅ out/ 目录存在');
    console.log('   文件:', files.join(', '));
    
    // 检查关键文件
    const requiredFiles = ['extension.js', 'formatter.js'];
    const missingFiles = requiredFiles.filter(file => !files.includes(file));
    if (missingFiles.length === 0) {
        console.log('✅ 所有必需文件都存在');
    } else {
        console.log('❌ 缺少文件:', missingFiles.join(', '));
    }
} else {
    console.log('❌ out/ 目录不存在，请运行 npm run compile');
}

// 2. 检查VSIX包
console.log('\n2. 检查VSIX包:');
const vsixFiles = fs.readdirSync(__dirname).filter(f => f.endsWith('.vsix'));
if (vsixFiles.length > 0) {
    console.log('✅ VSIX包存在:', vsixFiles[0]);
} else {
    console.log('❌ 未找到VSIX包，请运行 vsce package');
}

// 3. 测试格式化器逻辑
console.log('\n3. 测试格式化器逻辑:');
try {
    // 模拟vscode模块
    const mockVscode = {
        workspace: {
            getConfiguration: () => ({
                get: (key) => {
                    const defaults = {
                        'trailingComma': true,
                        'alignTypes': true,
                        'alignFieldNames': true,
                        'alignComments': true,
                        'indentSize': 2,
                        'maxLineLength': 100
                    };
                    return defaults[key];
                }
            })
        },
        TextEdit: class {
            constructor(range, newText) {
                this.range = range;
                this.newText = newText;
            }
            static replace(range, newText) {
                return new mockVscode.TextEdit(range, newText);
            }
        },
        Range: class {
            constructor(start, end) {
                this.start = start;
                this.end = end;
            }
        },
        Position: class {
            constructor(line, character) {
                this.line = line;
                this.character = character;
            }
        }
    };
    
    // 拦截require调用
    const Module = require('module');
    const originalRequire = Module.prototype.require;
    Module.prototype.require = function(id) {
        if (id === 'vscode') {
            return mockVscode;
        }
        return originalRequire.apply(this, arguments);
    };
    
    // 导入格式化器
    const { ThriftFormattingProvider } = require('./out/formattingProvider.js');
    
    // 恢复原始require
    Module.prototype.require = originalRequire;
    
    // 创建格式化器实例
    const formatter = new ThriftFormattingProvider();
    
    // 测试代码
    const testCode = `struct User {
  1: required UserId     id,
  2: required string   name,
  3: optional Email    email,
}`;
    
    // 使用反射访问私有方法
    const formatThriftCode = formatter.formatThriftCode || formatter['formatThriftCode'];
    if (typeof formatThriftCode === 'function') {
        const config = {
            trailingComma: true,
            alignTypes: true,
            alignFieldNames: true,
            alignComments: true,
            indentSize: 2,
            maxLineLength: 100
        };
        
        const result = formatThriftCode.call(formatter, testCode, config);
        
        if (result && result !== testCode) {
            console.log('✅ 格式化器逻辑正常工作');
            console.log('   原始代码行数:', testCode.split('\n').length);
            console.log('   格式化后行数:', result.split('\n').length);
            console.log('   代码已被修改:', result !== testCode);
        } else {
            console.log('⚠️  格式化器返回了相同的代码');
        }
    } else {
        console.log('❌ 无法访问格式化方法');
    }
    
} catch (error) {
    console.log('❌ 格式化器测试失败:', error.message);
}

// 4. 检查package.json配置
console.log('\n4. 检查package.json配置:');
try {
    const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    
    // 检查关键配置
    const checks = [
        { key: 'main', expected: './out/extension.js', actual: packageJson.main },
        { key: 'activationEvents', expected: 'onLanguage:thrift', actual: packageJson.activationEvents?.[0] },
        { key: 'engines.vscode', expected: '^1.74.0', actual: packageJson.engines?.vscode }
    ];
    
    checks.forEach(check => {
        if (check.actual === check.expected) {
            console.log(`✅ ${check.key}: ${check.actual}`);
        } else {
            console.log(`⚠️  ${check.key}: ${check.actual} (期望: ${check.expected})`);
        }
    });
    
    // 检查语言配置
    if (packageJson.contributes?.languages?.[0]?.id === 'thrift') {
        console.log('✅ Thrift语言配置正确');
    } else {
        console.log('❌ Thrift语言配置缺失或错误');
    }
    
    // 检查格式化命令
    const commands = packageJson.contributes?.commands || [];
    const formatCommands = commands.filter(cmd => cmd.command.includes('format'));
    if (formatCommands.length >= 2) {
        console.log('✅ 格式化命令已配置');
    } else {
        console.log('⚠️  格式化命令配置不完整');
    }
    
} catch (error) {
    console.log('❌ 读取package.json失败:', error.message);
}

// 5. 安装建议
console.log('\n5. 安装建议:');
console.log('=' .repeat(50));
console.log('1. 确保VSCode版本 >= 1.74.0');
console.log('2. 卸载旧版本的Thrift插件');
console.log('3. 安装新插件: code --install-extension thrift-support-0.1.0.vsix');
console.log('4. 重启VSCode');
console.log('5. 打开.thrift文件并尝试格式化 (Shift+Alt+F)');
console.log('6. 检查右下角语言模式是否显示"Thrift"');

console.log('\n📋 详细安装指南请查看: INSTALL_AND_TEST.md');
console.log('\n🔧 如果仍有问题，请检查VSCode开发者控制台的错误信息');
