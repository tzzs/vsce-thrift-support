#!/usr/bin/env node

/**
 * Unified Test Runner for Thrift Language Support Extension
 * Combines functionality from run-all.js and run-all-tests.js
 * Runs all unit tests with formatted output and structured error reporting
 */

const fs = require('fs');
const path = require('path');
const { Worker } = require('worker_threads');
const { execSync } = require('child_process');

// 配置常量
const CONFIG = {
    PARALLEL_TESTS: false, // 是否并行执行测试
    SHOW_PASSED_OUTPUT: true, // 是否显示通过测试的输出
    SHOW_FAILED_OUTPUT: true, // 是否显示失败测试的输出
    MAX_OUTPUT_LENGTH: 2000, // 最大输出长度限制
    TEST_TIMEOUT: 30000, // 测试超时时间（毫秒）
    PRE_CHECK_MODULES: true, // 是否预检查模块依赖
};

// 颜色常量
const COLORS = {
    RESET: '\x1b[0m',
    BRIGHT: '\x1b[1m',
    DIM: '\x1b[2m',
    RED: '\x1b[31m',
    GREEN: '\x1b[32m',
    YELLOW: '\x1b[33m',
    BLUE: '\x1b[34m',
    MAGENTA: '\x1b[35m',
    CYAN: '\x1b[36m',
    WHITE: '\x1b[37m',
    BG_RED: '\x1b[41m',
    BG_GREEN: '\x1b[42m',
    BG_YELLOW: '\x1b[43m',
};

// 图标常量
const ICONS = {
    INFO: 'ℹ️',
    SUCCESS: '✅',
    FAILURE: '❌',
    WARNING: '⚠️',
    RUNNING: '🔄',
    COMPLETED: '🎉',
    ERROR: '💥',
    TEST: '🧪',
    SUMMARY: '📊',
    TIME: '⏱️',
    SKIP: '⏭️',
};

console.log(`${COLORS.CYAN}${ICONS.TEST} Unified Test Runner for Thrift Language Support${COLORS.RESET}`);
console.log(`${COLORS.DIM}${'='.repeat(70)}${COLORS.RESET}`);

/**
 * 检查测试文件的依赖模块是否存在
 */
function checkTestDependencies(testFile) {
    try {
        const testPath = path.join(__dirname, testFile);
        const testDir = path.dirname(testPath);
        const content = fs.readFileSync(testPath, 'utf8');
        const mockVscodePath = path.join(__dirname, 'mock_vscode.js');

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
                const outMatch = modulePath.replace(/\\/g, '/').match(/^(?:\.{1,2}\/)+out\/(.+)$/);
                const mockMatch = modulePath.replace(/\\/g, '/').match(/^(?:\.\/)?mock[-_]vscode(?:\.js)?$/);
                const fullPath = outMatch
                    ? path.join(__dirname, '..', 'out', outMatch[1])
                    : mockMatch
                        ? mockVscodePath
                        : path.resolve(testDir, modulePath);
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

            // out 模块检查已在相对路径检查中处理
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
 * 获取所有测试文件，并进行依赖检查
 */
function getAllTestFiles() {
    const testDir = __dirname;
    const testFiles = [];
    const skippedFiles = [];

    const ignoredDirs = new Set(['node_modules', 'out', '.git']);

    function walk(dir) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            const entryPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                if (ignoredDirs.has(entry.name)) {
                    continue;
                }
                walk(entryPath);
                continue;
            }
            if (!entry.isFile()) {
                continue;
            }
            if (entry.name.startsWith('test-') && entry.name.endsWith('.js')) {
                const relativePath = path.relative(testDir, entryPath);
                if (CONFIG.PRE_CHECK_MODULES) {
                    const deps = checkTestDependencies(relativePath);
                    if (deps.missing) {
                        skippedFiles.push({
                            file: relativePath,
                            reason: deps.reason
                        });
                        continue;
                    }
                }
                testFiles.push(relativePath);
            }
        }
    }

    walk(testDir);

    // 按字母顺序排序
    testFiles.sort();

    return {
        runnable: testFiles,
        skipped: skippedFiles
    };
}

/**
 * 格式化时间
 */
function formatTime(ms) {
    if (ms < 1000) {
        return `${ms}ms`;
    } else if (ms < 60000) {
        return `${(ms / 1000).toFixed(2)}s`;
    } else {
        const minutes = Math.floor(ms / 60000);
        const seconds = ((ms % 60000) / 1000).toFixed(0);
        return `${minutes}m ${seconds}s`;
    }
}

/**
 * 截断输出
 */
function truncateOutput(output, maxLength = CONFIG.MAX_OUTPUT_LENGTH) {
    if (!output || output.length <= maxLength) {
        return output;
    }
    return output.substring(0, maxLength) + `\n${COLORS.DIM}... (output truncated)${COLORS.RESET}`;
}

/**
 * 运行单个测试
 */
async function runTest(testFile, index, total) {
    const startTime = Date.now();
    const testNumber = `${index + 1}`.padStart(3);

    return new Promise((resolve) => {
        const testPath = path.join(__dirname, testFile);

        console.log(`${COLORS.BLUE}${ICONS.RUNNING} [${testNumber}/${total}] Running ${testFile}...${COLORS.RESET}`);

        const worker = new Worker(path.join(__dirname, 'worker-test-runner.js'), {
            workerData: { testPath },
            stdout: true,
            stderr: true,
        });

        let output = '';
        let errorOutput = '';
        let timeout = false;

        worker.stdout.on('data', (data) => {
            output += data.toString();
        });

        worker.stderr.on('data', (data) => {
            errorOutput += data.toString();
        });

        // 超时处理
        const timeoutId = setTimeout(() => {
            timeout = true;
            worker.terminate();
        }, CONFIG.TEST_TIMEOUT);

        worker.on('exit', (code) => {
            clearTimeout(timeoutId);
            const duration = Date.now() - startTime;
            const success = code === 0 && !timeout;

            const result = {
                testFile,
                success,
                exitCode: timeout ? -2 : code,
                output: output.trim(),
                errorOutput: errorOutput.trim(),
                duration,
                timeout,
            };

            if (success) {
                console.log(`${COLORS.GREEN}${ICONS.SUCCESS} [${testNumber}/${total}] ${testFile} - PASSED (${formatTime(duration)})${COLORS.RESET}`);
                if (CONFIG.SHOW_PASSED_OUTPUT && output) {
                    console.log(`${COLORS.DIM}${truncateOutput(output)}${COLORS.RESET}`);
                }
            } else {
                console.log(`${COLORS.RED}${ICONS.FAILURE} [${testNumber}/${total}] ${testFile} - FAILED (${formatTime(duration)})${COLORS.RESET}`);
                if (CONFIG.SHOW_FAILED_OUTPUT) {
                    if (timeout) {
                        console.log(`${COLORS.YELLOW}${ICONS.WARNING} Test timed out after ${formatTime(CONFIG.TEST_TIMEOUT)}${COLORS.RESET}`);
                    }
                    if (output) {
                        console.log(`${COLORS.YELLOW}STDOUT:${COLORS.RESET}\n${truncateOutput(output)}`);
                    }
                    if (errorOutput) {
                        console.log(`${COLORS.RED}STDERR:${COLORS.RESET}\n${truncateOutput(errorOutput)}`);
                    }
                }
            }

            resolve(result);
        });

        worker.on('error', (error) => {
            clearTimeout(timeoutId);
            const duration = Date.now() - startTime;

            const result = {
                testFile,
                success: false,
                exitCode: -3,
                output: '',
                errorOutput: `Failed to spawn test process: ${error.message}`,
                duration,
                timeout: false,
            };

            console.log(`${COLORS.RED}${ICONS.ERROR} [${testNumber}/${total}] ${testFile} - SPAWN ERROR${COLORS.RESET}`);
            console.log(`${COLORS.RED}${error.message}${COLORS.RESET}`);
            resolve(result);
        });
    });
}

/**
 * 显示进度条
 */
function showProgressBar(current, total, width = 50) {
    const percentage = Math.round((current / total) * 100);
    const filled = Math.round((current / total) * width);
    const empty = width - filled;

    const bar = '█'.repeat(filled) + '░'.repeat(empty);
    const color = percentage === 100 ? COLORS.GREEN : percentage >= 50 ? COLORS.YELLOW : COLORS.RED;

    process.stdout.write(`\r${color}[${bar}] ${percentage}%${COLORS.RESET}`);
}

/**
 * 检查并构建 TypeScript 源文件
 */
async function checkAndCompile() {
    console.log(`${COLORS.CYAN}${ICONS.INFO} 检查编译状态...${COLORS.RESET}`);

    const keyFiles = [
        path.join(__dirname, '../out/extension.js'),
        path.join(__dirname, '../out/formattingProvider.js'),
        path.join(__dirname, '../out/ast/parser.js')
    ];

    const missingFiles = keyFiles.filter(file => !fs.existsSync(file));

    if (missingFiles.length > 0) {
        console.log(`${COLORS.YELLOW}${ICONS.WARNING} 检测到缺失的编译文件，正在执行 'npm run build'${COLORS.RESET}`);
        execSync('npm run build', {stdio: 'inherit'});
        const stillMissing = keyFiles.filter(file => !fs.existsSync(file));
        if (stillMissing.length > 0) {
            throw new Error('Missing compiled files. Run npm run build first.');
        }
    }

    console.log(`${COLORS.GREEN}${ICONS.SUCCESS} 编译文件已存在，跳过编译${COLORS.RESET}\n`);
    return Promise.resolve();
}

/**
 * 运行所有测试
 */
async function runAllTests() {
    await checkAndCompile();
    const startTime = Date.now();
    const { runnable, skipped } = getAllTestFiles();

    console.log(`${COLORS.CYAN}${ICONS.INFO} Found ${runnable.length + skipped.length} test files${COLORS.RESET}`);

    if (skipped.length > 0) {
        console.log(`${COLORS.YELLOW}${ICONS.WARNING} ${skipped.length} test files will be skipped due to missing dependencies:${COLORS.RESET}`);
        skipped.forEach(({ file, reason }) => {
            console.log(`  ${COLORS.DIM}${ICONS.SKIP} ${file}: ${reason}${COLORS.RESET}`);
        });
        console.log('');
    }

    if (runnable.length === 0) {
        console.log(`${COLORS.YELLOW}${ICONS.WARNING} No runnable test files found${COLORS.RESET}`);
        return;
    }

    console.log(`${COLORS.CYAN}${ICONS.INFO} Running ${runnable.length} runnable test files${COLORS.RESET}`);
    console.log(`${COLORS.DIM}${'-'.repeat(70)}${COLORS.RESET}`);

    const results = [];
    let passed = 0;
    let failed = 0;

    // 运行测试
    for (let i = 0; i < runnable.length; i++) {
        const result = await runTest(runnable[i], i, runnable.length);
        results.push(result);

        if (result.success) {
            passed++;
        } else {
            failed++;
        }

        // 更新进度条
        showProgressBar(i + 1, runnable.length);
    }

    console.log('\n'); // 换行以清除进度条

    const totalDuration = Date.now() - startTime;

    // 显示详细结果
    console.log(`\n${COLORS.CYAN}${ICONS.SUMMARY} Test Results Summary${COLORS.RESET}`);
    console.log(`${COLORS.DIM}${'='.repeat(70)}${COLORS.RESET}`);

    // 总体统计
    console.log(`${ICONS.TEST} Total Test Files: ${runnable.length + skipped.length}`);
    console.log(`${ICONS.SUCCESS} Runnable: ${runnable.length}`);
    console.log(`${ICONS.SKIP} Skipped: ${skipped.length}`);
    console.log(`${ICONS.SUCCESS} Passed: ${passed} ${passed > 0 ? `(${(passed / runnable.length * 100).toFixed(1)}%)` : ''}`);
    console.log(`${ICONS.FAILURE} Failed: ${failed} ${failed > 0 ? `(${(failed / runnable.length * 100).toFixed(1)}%)` : ''}`);
    console.log(`${ICONS.TIME} Total Time: ${formatTime(totalDuration)}`);

    // 平均测试时间
    const avgDuration = results.reduce((sum, r) => sum + r.duration, 0) / results.length;
    console.log(`${ICONS.TIME} Average Time per Test: ${formatTime(avgDuration)}`);

    // 显示失败的测试详情
    if (failed > 0) {
        console.log(`\n${COLORS.RED}${ICONS.ERROR} Failed Tests Details:${COLORS.RESET}`);
        results.filter(r => !r.success).forEach(result => {
            console.log(`\n${COLORS.RED}• ${result.testFile}${COLORS.RESET}`);
            console.log(`  Exit Code: ${result.exitCode}`);
            console.log(`  Duration: ${formatTime(result.duration)}`);
            if (result.timeout) {
                console.log(`  ${COLORS.YELLOW}Reason: Test timed out${COLORS.RESET}`);
            }
        });
    }

    // 显示最慢的测试
    const slowTests = results
        .filter(r => r.success)
        .sort((a, b) => b.duration - a.duration)
        .slice(0, 5);

    if (slowTests.length > 0) {
        console.log(`\n${COLORS.YELLOW}${ICONS.TIME} Slowest Tests:${COLORS.RESET}`);
        slowTests.forEach(result => {
            console.log(`  ${result.testFile}: ${formatTime(result.duration)}`);
        });
    }

    console.log(`\n${COLORS.DIM}${'='.repeat(70)}${COLORS.RESET}`);

    // 最终结果
    if (failed === 0 && runnable.length > 0) {
        console.log(`${COLORS.GREEN}${ICONS.COMPLETED} All runnable tests passed! 🎉${COLORS.RESET}`);
        process.exit(0);
    } else if (failed > 0) {
        console.log(`${COLORS.RED}${ICONS.ERROR} ${failed} test(s) failed!${COLORS.RESET}`);
        process.exit(1);
    } else {
        console.log(`${COLORS.YELLOW}${ICONS.WARNING} No tests were run${COLORS.RESET}`);
        process.exit(0);
    }
}

/**
 * 显示帮助信息
 */
function showHelp() {
    console.log(`${COLORS.CYAN}Unified Test Runner - Help${COLORS.RESET}`);
    console.log(`${COLORS.DIM}${'-'.repeat(70)}${COLORS.RESET}`);
    console.log('Usage: node run-all-unified.js [options]');
    console.log('');
    console.log('Options:');
    console.log('  --help, -h          Show this help message');
    console.log('  --no-passed-output  Hide output from passed tests');
    console.log('  --no-failed-output  Hide output from failed tests');
    console.log('  --no-pre-check      Disable dependency pre-check');
    console.log('  --timeout <ms>      Set test timeout in milliseconds (default: 30000)');
    console.log('  --max-output <len>  Set maximum output length (default: 2000)');
    console.log('');
    console.log('Examples:');
    console.log('  node run-all-unified.js');
    console.log('  node run-all-unified.js --no-passed-output');
    console.log('  node run-all-unified.js --timeout 60000 --max-output 5000');
}

/**
 * 解析命令行参数
 */
function parseArguments() {
    const args = process.argv.slice(2);

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];

        switch (arg) {
            case '--help':
            case '-h':
                showHelp();
                process.exit(0);
                break;

            case '--no-passed-output':
                CONFIG.SHOW_PASSED_OUTPUT = false;
                break;

            case '--no-failed-output':
                CONFIG.SHOW_FAILED_OUTPUT = false;
                break;

            case '--no-pre-check':
                CONFIG.PRE_CHECK_MODULES = false;
                break;

            case '--timeout':
                if (i + 1 < args.length) {
                    CONFIG.TEST_TIMEOUT = parseInt(args[++i], 10);
                }
                break;

            case '--max-output':
                if (i + 1 < args.length) {
                    CONFIG.MAX_OUTPUT_LENGTH = parseInt(args[++i], 10);
                }
                break;

            default:
                console.log(`${COLORS.YELLOW}${ICONS.WARNING} Unknown argument: ${arg}${COLORS.RESET}`);
                break;
        }
    }
}

// 主程序
async function main() {
    try {
        parseArguments();
        await runAllTests();
    } catch (error) {
        console.error(`${COLORS.RED}${ICONS.ERROR} Test runner failed: ${error.message}${COLORS.RESET}`);
        console.error(error.stack);
        process.exit(1);
    }
}

// 运行主程序
main();
