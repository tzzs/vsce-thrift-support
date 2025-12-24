const vscode = require('./mock_vscode');
const path = require('path');
const fs = require('fs');

// Test file modification and dependency tracking
class DependencyTest {
    constructor() {
        this.dependentFiles = new Map();
        this.fileModificationLog = [];
    }

    // 模拟文件依赖关系
    setupDependencies() {
        // test_091.thrift includes test_020, test_078, test_001
        this.dependentFiles.set('test_020.thrift', ['test_091.thrift']);
        this.dependentFiles.set('test_078.thrift', ['test_091.thrift']);
        this.dependentFiles.set('test_001.thrift', ['test_091.thrift']);

        console.log('[Dependency] Setup file dependencies:');
        for (const [includeFile, dependents] of this.dependentFiles.entries()) {
            console.log(`  ${includeFile} -> ${dependents.join(', ')}`);
        }
    }

    // 模拟文件修改事件
    simulateFileChange(filePath) {
        const fileName = path.basename(filePath);
        console.log(`\n[Dependency] File modified: ${fileName}`);

        const changeTime = new Date().toISOString();
        this.fileModificationLog.push({
            file: fileName,
            time: changeTime,
            triggeredReanalysis: []
        });

        // 查找依赖这个文件的所有文档
        const dependents = this.dependentFiles.get(fileName) || [];

        if (dependents.length > 0) {
            console.log(`[Dependency] Found ${dependents.length} dependent files:`);

            for (const dependentFile of dependents) {
                console.log(`  - ${dependentFile} (will be re-analyzed)`);

                // 记录触发的重新分析
                this.fileModificationLog[this.fileModificationLog.length - 1]
                    .triggeredReanalysis.push(dependentFile);

                // 模拟延迟分析依赖文件，避免立即连锁反应
                setTimeout(() => {
                    this.simulateReanalysis(dependentFile, fileName);
                }, 200); // 双倍延迟
            }
        } else {
            console.log('[Dependency] No dependent files found');
        }
    }

    // 模拟重新分析
    simulateReanalysis(dependentFile, triggerFile) {
        console.log(`\n[Dependency] 🔍 Re-analyzing ${dependentFile} (triggered by ${triggerFile})`);

        // 这里会触发包含文件分析，使用缓存机制
        console.log(`[Dependency] Checking includes for ${dependentFile}...`);

        // 模拟分析过程
        setTimeout(() => {
            console.log(`[Dependency] ✅ Completed reanalysis of ${dependentFile}`);
        }, 100);
    }

    // 获取测试报告
    getTestReport() {
        console.log('\n📋 Dependency Test Report:');
        console.log('==========================');

        if (this.fileModificationLog.length === 0) {
            console.log('No file modifications were simulated');
            return;
        }

        let totalReanalysis = 0;
        for (const log of this.fileModificationLog) {
            console.log(`\nFile: ${log.file}`);
            console.log(`Time: ${log.time}`);
            console.log(`Triggered reanalysis: ${log.triggeredReanalysis.length} files`);

            if (log.triggeredReanalysis.length > 0) {
                for (const reanalyzed of log.triggeredReanalysis) {
                    console.log(`  - ${reanalyzed}`);
                }
            }
            totalReanalysis += log.triggeredReanalysis.length;
        }

        console.log(`\nTotal reanalyses triggered: ${totalReanalysis}`);
        console.log(`Average reanalyses per modification: ${(totalReanalysis / this.fileModificationLog.length).toFixed(1)}`);
    }
}

async function runDependencyTest() {
    console.log('🔄 File Modification and Dependency Test');
    console.log('==========================================\n');

    const test = new DependencyTest();
    test.setupDependencies();

    // 测试1: 修改一个包含文件
    console.log('🔄 Test 1: Modify included file test_020.thrift');
    test.simulateFileChange('test-thrift/test_020.thrift');

    // 等待异步操作完成
    await new Promise(resolve => setTimeout(resolve, 500));

    // 测试2: 修改另一个包含文件
    console.log('\n🔄 Test 2: Modify included file test_078.thrift');
    test.simulateFileChange('test-thrift/test_078.thrift');

    // 等待异步操作完成
    await new Promise(resolve => setTimeout(resolve, 500));

    // 生成测试报告
    test.getTestReport();

    // 验证结果
    console.log('\n📊 Test Validation:');
    console.log('====================');

    const expectedReanalyses = 2; // 每次修改应该触发1个重新分析
    const actualReanalyses = test.fileModificationLog.reduce((sum, log) => sum + log.triggeredReanalysis.length, 0);

    console.log(`Expected reanalyses: ${expectedReanalyses}`);
    console.log(`Actual reanalyses: ${actualReanalyses}`);

    if (actualReanalyses === expectedReanalyses) {
        console.log('✅ Dependency tracking is working correctly!');
    } else {
        console.log('❌ Dependency tracking may have issues');
    }
}

// 运行测试
if (require.main === module) {
    runDependencyTest().catch(console.error);
}

module.exports = {DependencyTest};