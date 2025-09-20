const { spawnSync } = require('child_process');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const tests = [
  'tests/simple-test.js',
  'tests/test-include-navigation.js',
  'tests/test-include-navigation-fix.js',
  'tests/test-formatter.js',
  'tests/test-vscode-format.js',
  'tests/test-user-scenario.js',
  'tests/test-user-selected-range.js',
  'tests/test-enum-formatting.js',
  'tests/test-enum-annotations-combinations.js',
  'tests/test-struct-annotations-combinations.js',
  'tests/test-struct-defaults-alignment.js',
  'tests/test-example-struct-blank-line.js',
  'tests/test-edge-cases.js',
  'tests/test-const-alignment.js',
  'tests/test-const-formatting.js',
  'tests/test-main-file-regression.js',
  'tests/test-range-context.js',
  'tests/test-complex-types.js',
  'tests/test-trailing-comma.js',
  'tests/test-struct-blank-lines.js',
  'tests/test-full-file-format.js',
  'tests/test-real-format.js',
  'tests/test-vscode-simulation.js',
  'tests/test-include-filename-detection.js',
  'tests/test-example-lines-25-38.js',
  'tests/test-namespace-navigation.js',
  'tests/test-indent-width.js',
  'tests/format-example.js',
  // Added edge cases test for include/namespace behaviors
  'tests/test-namespace-edge-cases.js',
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

// Add new targeted tests to improve coverage of uncovered branches
