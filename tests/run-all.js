const { spawnSync } = require('child_process');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const tests = [
  'tests/test-include-navigation-fix.js',
  'tests/test-complex-types.js',
  'tests/test-enum-formatting.js',
  'tests/test-indent-width.js',
  'tests/test-trailing-comma.js',
  'tests/test-const-formatting.js'
];

let failed = 0;

for (const test of tests) {
  const abs = path.resolve(projectRoot, test);
  console.log(`\n\n===== Running: ${test} =====`);
  const result = spawnSync(process.execPath, [abs], {
    cwd: projectRoot,
    stdio: 'inherit',
    env: process.env,
  });
  if (result.status !== 0) {
    console.error(`Test failed: ${test} (exit ${result.status})`);
    failed++;
  }
}

if (failed > 0) {
  console.error(`\n${failed} test file(s) failed.`);
  process.exit(1);
}

console.log('\nAll test files passed.');
