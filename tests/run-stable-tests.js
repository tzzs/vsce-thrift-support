#!/usr/bin/env node

/**
 * Test runner for stable tests only
 * Runs only a small set of fast, reliable tests
 */

const {spawnSync} = require('child_process');
const path = require('path');

const stableTests = [
    'tests/src/formattingProvider/test-format-core.js',
    'tests/src/formattingProvider/test-format-indentation.js',
    'tests/src/formattingProvider/test-trailing-comma.js',
    'tests/src/formattingProvider/test-complex-types.js',
    'tests/src/definitionProvider/test-include-filename-detection.js',
    'tests/src/diagnostics/test-diagnostics-edge-cases.js',
    'tests/src/thriftFormatter/test-struct-formatting.js'
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
console.log('📊 Test Results:');
console.log(`✅ Passed: ${passed}`);
console.log(`❌ Failed: ${failed}`);
console.log(`📈 Total: ${passed + failed}`);

if (failed > 0) {
    console.error(`\n${failed} test file(s) failed.`);
    process.exit(1);
} else {
    console.log('\n🎉 All stable tests passed!');
}
