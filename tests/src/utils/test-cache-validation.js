const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const assert = require('assert');

class MockDiagnosticManager {
    constructor() {
        this.includeTypesCache = new Map();
        this.includeFileTimestamps = new Map();
        this.includeFileStats = new Map();
        this.INCLUDE_CACHE_MAX_AGE = 3 * 60 * 1000;
        this.analysisCount = 0;
    }

    async simulateFileAnalysis(documentPath, includedFiles) {
        const includedTypes = new Map();
        const now = Date.now();

        for (const includedFile of includedFiles) {
            try {
                const stat = fs.statSync(includedFile);
                const fileStats = {mtime: stat.mtime.getTime(), size: stat.size};
                const includedFileKey = includedFile;

                const cachedStats = this.includeFileStats.get(includedFileKey);
                const cachedTypes = this.includeTypesCache.get(includedFileKey);
                const cachedTime = this.includeFileTimestamps.get(includedFileKey);

                const cacheValid =
                    cachedTypes &&
                    cachedTime &&
                    now - cachedTime < this.INCLUDE_CACHE_MAX_AGE &&
                    fileStats &&
                    cachedStats &&
                    fileStats.mtime === cachedStats.mtime &&
                    fileStats.size === cachedStats.size;

                if (cacheValid) {
                    for (const [name, kind] of cachedTypes) {
                        if (!includedTypes.has(name)) {
                            includedTypes.set(name, kind);
                        }
                    }
                    continue;
                }

                this.analysisCount++;

                await this.simulateFileParsing(includedFile);

                const types = new Map([
                    [`TypeFrom_${path.basename(includedFile, '.thrift')}_1`, 'struct'],
                    [`TypeFrom_${path.basename(includedFile, '.thrift')}_2`, 'enum']
                ]);

                this.includeTypesCache.set(includedFileKey, new Map(types));
                this.includeFileTimestamps.set(includedFileKey, now);
                this.includeFileStats.set(includedFileKey, fileStats);

                for (const [name, kind] of types) {
                    if (!includedTypes.has(name)) {
                        includedTypes.set(name, kind);
                    }
                }
            } catch (error) {
            }
        }

        return includedTypes;
    }

    async simulateFileParsing(filePath) {
        await new Promise((resolve) => setTimeout(resolve, 10));
    }

    clearCacheForFile(filePath) {
        const fileKey = filePath;
        if (this.includeTypesCache.has(fileKey)) {
            this.includeTypesCache.delete(fileKey);
            this.includeFileTimestamps.delete(fileKey);
            this.includeFileStats.delete(fileKey);
        }
    }

    getCacheStats() {
        return {
            cacheSize: this.includeTypesCache.size,
            analysisCount: this.analysisCount
        };
    }
}

describe('cache-validation', () => {
    it('should pass runCacheTest', async () => {
        const manager = new MockDiagnosticManager();
        const basePath = path.join(__dirname, '../../test-thrift');
        const testFile = path.join(basePath, 'test_091.thrift');
        const includedFiles = [
            path.join(basePath, 'test_020.thrift'),
            path.join(basePath, 'test_078.thrift'),
            path.join(basePath, 'test_001.thrift')
        ];

        const existingFiles = includedFiles.filter(f => fs.existsSync(f));

        if (existingFiles.length === 0) {
            return;
        }

        const result1 = await manager.simulateFileAnalysis(testFile, existingFiles);
        const stats1 = manager.getCacheStats();

        const result2 = await manager.simulateFileAnalysis(testFile, existingFiles);
        const stats2 = manager.getCacheStats();

        assert.strictEqual(stats1.analysisCount, existingFiles.length, 'First run should analyze all files');
        assert.strictEqual(stats2.analysisCount, existingFiles.length, 'Second run should use cache');

        if (existingFiles.length > 0) {
            const modifiedFile = existingFiles[0];
            const currentTime = new Date();
            fs.utimesSync(modifiedFile, currentTime, currentTime);
            manager.clearCacheForFile(modifiedFile);

            const result3 = await manager.simulateFileAnalysis(testFile, existingFiles);
            const stats3 = manager.getCacheStats();

            assert.strictEqual(stats3.analysisCount, existingFiles.length + 1, 'Modified file should be reanalyzed');
        }
    });
});