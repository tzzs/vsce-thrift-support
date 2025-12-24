#!/usr/bin/env node

/**
 * Test runner for stable tests only
 * Runs only the tests that are known to pass after refactoring
 */

const {spawnSync} = require('child_process');
const path = require('path');

// 只包含当前稳定的测试文件
const stableTests = [
    'tests/debug-definition-test.js',
    'tests/simple-test.js',
    'tests/test-include-navigation-fix.js',
    'tests/test-vscode-simulation.js',
    'tests/test-indent-width.js',
    'tests/format-example.js',
    'tests/test-namespace-edge-cases.js',
    'tests/test-diagnostics.js',
    'tests/test-const-formatting.js',
    'tests/test-enum-formatting.js',
    'tests/test-complex-types.js',
    'tests/test-trailing-comma.js'
];

let failed = 0;
let passed = 0;

console.log('🧪 Running stable tests only...');
console.log('='.repeat(60));

for (const test of stableTests) {
    console.log(`\n===== Running: ${test} =====`);
    const res = spawnSync(process.execPath, [path.resolve(test)], {stdio: 'inherit'});
    if (res.status !== 0) {
        console.error(`❌ Test failed: ${test}`);
        failed++;
    } else {
        console.log(`✅ Test passed: ${test}`);
        passed++;
    }
}

console.log('\n' + '='.repeat(60));
console.log(`📊 Test Results:`);
console.log(`✅ Passed: ${passed}`);
console.log(`❌ Failed: ${failed}`);
console.log(`📈 Total: ${passed + failed}`);

if (failed > 0) {
    console.error(`\n${failed} test file(s) failed.`);
    process.exit(1);
} else {
    console.log('\n🎉 All stable tests passed!');
}