const vscode = require('./mock_vscode');
const path = require('path');
const fs = require('fs');

// Mock the diagnostic manager to test caching behavior
class MockDiagnosticManager {
    constructor() {
        this.includeTypesCache = new Map();
        this.includeFileTimestamps = new Map();
        this.includeFileStats = new Map();
        this.INCLUDE_CACHE_MAX_AGE = 3 * 60 * 1000; // 3分钟缓存
        this.analysisCount = 0;
    }

    async simulateFileAnalysis(documentPath, includedFiles) {
        console.log(`[Test] Simulating analysis for: ${path.basename(documentPath)}`);
        console.log(`[Test] Included files: ${includedFiles.map(f => path.basename(f)).join(', ')}`);
        
        const includedTypes = new Map();
        const now = Date.now();

        for (const includedFile of includedFiles) {
            try {
                // 模拟文件状态检查
                const stat = fs.statSync(includedFile);
                const fileStats = { mtime: stat.mtime.getTime(), size: stat.size };
                const includedFileKey = includedFile;
                
                const cachedStats = this.includeFileStats.get(includedFileKey);
                const cachedTypes = this.includeTypesCache.get(includedFileKey);
                const cachedTime = this.includeFileTimestamps.get(includedFileKey);
                
                // 判断缓存是否有效
                const cacheValid = cachedTypes && cachedTime && 
                    (now - cachedTime) < this.INCLUDE_CACHE_MAX_AGE &&
                    fileStats && cachedStats &&
                    fileStats.mtime === cachedStats.mtime && 
                    fileStats.size === cachedStats.size;
                
                if (cacheValid) {
                    console.log(`[Test] ✅ Using cached types for: ${path.basename(includedFile)}`);
                    for (const [name, kind] of cachedTypes) {
                        if (!includedTypes.has(name)) {
                            includedTypes.set(name, kind);
                        }
                    }
                    continue;
                }

                console.log(`[Test] 📊 Analyzing included file: ${path.basename(includedFile)} (cache miss)`);
                
                // 只有在缓存未命中时才增加分析计数
                this.analysisCount++;
                
                // 模拟文件分析
                await this.simulateFileParsing(includedFile);
                
                // 模拟解析结果
                const types = new Map([
                    [`TypeFrom_${path.basename(includedFile, '.thrift')}_1`, 'struct'],
                    [`TypeFrom_${path.basename(includedFile, '.thrift')}_2`, 'enum']
                ]);

                // 更新缓存
                this.includeTypesCache.set(includedFileKey, new Map(types));
                this.includeFileTimestamps.set(includedFileKey, now);
                this.includeFileStats.set(includedFileKey, fileStats);

                // 添加类型
                for (const [name, kind] of types) {
                    if (!includedTypes.has(name)) {
                        includedTypes.set(name, kind);
                    }
                }
            } catch (error) {
                console.log(`[Test] ❌ Failed to analyze included file: ${path.basename(includedFile)}, error: ${error.message}`);
                continue;
            }
        }

        return includedTypes;
    }

    async simulateFileParsing(filePath) {
        // 模拟文件解析耗时
        await new Promise(resolve => setTimeout(resolve, 100));
        console.log(`[Test] 📄 Parsed file: ${path.basename(filePath)}`);
    }

    clearCacheForFile(filePath) {
        const fileKey = filePath;
        if (this.includeTypesCache.has(fileKey)) {
            this.includeTypesCache.delete(fileKey);
            this.includeFileTimestamps.delete(fileKey);
            this.includeFileStats.delete(fileKey);
            console.log(`[Test] 🗑️  Cleared cache for: ${path.basename(filePath)}`);
        }
    }

    getCacheStats() {
        return {
            cacheSize: this.includeTypesCache.size,
            analysisCount: this.analysisCount
        };
    }
}

async function runCacheTest() {
    console.log('\n🚀 Starting Cache Validation Test\n');
    
    const manager = new MockDiagnosticManager();
    const basePath = 'e:\\workspaces\\trae\\trae2\\thrift-support2';
    const testFile = path.join(basePath, 'test-thrift/test_091.thrift');
    const includedFiles = [
        path.join(basePath, 'test-thrift/test_020.thrift'),
        path.join(basePath, 'test-thrift/test_078.thrift'), 
        path.join(basePath, 'test-thrift/test_001.thrift')
    ];

    console.log('📋 Test Scenario: File with 3 included dependencies\n');

    // 第一次分析 - 应该全部缓存未命中
    console.log('🔄 Test 1: First analysis (all cache misses expected)');
    const result1 = await manager.simulateFileAnalysis(testFile, includedFiles);
    const stats1 = manager.getCacheStats();
    console.log(`   Result: ${result1.size} types collected, ${stats1.analysisCount} files analyzed`);
    console.log(`   Cache size: ${stats1.cacheSize}\n`);

    // 第二次分析 - 应该全部缓存命中
    console.log('🔄 Test 2: Second analysis (all cache hits expected)');
    const result2 = await manager.simulateFileAnalysis(testFile, includedFiles);
    const stats2 = manager.getCacheStats();
    console.log(`   Result: ${result2.size} types collected, ${stats2.analysisCount} files analyzed`);
    console.log(`   Cache size: ${stats2.cacheSize}\n`);

    // 修改一个包含文件
    console.log('🔄 Test 3: Modify one included file');
    const modifiedFile = includedFiles[0];
    console.log(`   Modifying: ${path.basename(modifiedFile)}`);
    
    // 模拟文件修改（更新修改时间）
    const currentTime = new Date();
    fs.utimesSync(modifiedFile, currentTime, currentTime);
    
    // 清除修改文件的缓存
    manager.clearCacheForFile(modifiedFile);
    
    // 再次分析 - 应该只有修改的文件重新分析
    console.log('🔄 Test 4: Analysis after file modification');
    const result3 = await manager.simulateFileAnalysis(testFile, includedFiles);
    const stats3 = manager.getCacheStats();
    console.log(`   Result: ${result3.size} types collected, ${stats3.analysisCount} files analyzed`);
    console.log(`   Cache size: ${stats3.cacheSize}\n`);

    // 验证结果
    console.log('📊 Test Results Summary:');
    console.log(`   Total analyses performed: ${stats3.analysisCount}`);
    console.log(`   Analyses without caching: ${includedFiles.length * 3} (3 rounds × 3 files)`);
    console.log(`   Analyses with caching: ${stats3.analysisCount}`);
    
    // 计算正确的缓存效率
    const analysesWithoutCache = includedFiles.length * 3;
    const analysesWithCache = stats3.analysisCount;
    const cacheHits = analysesWithoutCache - analysesWithCache;
    const cacheEfficiency = (cacheHits / analysesWithoutCache) * 100;
    
    console.log(`   Cache hits: ${cacheHits}`);
    console.log(`   Cache efficiency: ${cacheEfficiency.toFixed(1)}%`);
    
    if (cacheHits > 0) {
        console.log('✅ Cache is working correctly!');
    } else {
        console.log('❌ Cache may not be working as expected');
    }
}

// 运行测试
if (require.main === module) {
    runCacheTest().catch(console.error);
}

module.exports = { MockDiagnosticManager };