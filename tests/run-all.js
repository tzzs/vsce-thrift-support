// tests/run-all.js
const { spawnSync } = require('child_process');
const path = require('path');

// Add new target tests to improve coverage
const tests = [
  'tests/simple-test.js',
  'tests/test-include-navigation-fix.js',
  'tests/test-vscode-simulation.js',
  'tests/test-indent-width.js',
  'tests/format-example.js',
  'tests/test-namespace-edge-cases.js',
  'tests/test-diagnostics.js',
  'tests/test-rename-provider.js',
  'tests/test-code-actions-provider.js',
  // New tests for P0 priority features
  'tests/test-completion-provider.js',
  'tests/test-document-symbol-provider.js',
  'tests/test-workspace-symbol-provider.js',
  'tests/test-references-provider.js',
  'tests/test-folding-range-provider.js',
  'tests/test-selection-range-provider.js',
  // Test for escape sequence fix
  'tests/test-escape-sequence-fix.js'
];

let failed = 0;

for (const test of tests) {
  console.log(`\n===== Running: ${test} =====`);
  const res = spawnSync(process.execPath, [path.resolve(test)], { stdio: 'inherit' });
  if (res.status !== 0) {
    console.error(`Test failed: ${test}`);
    failed++;
  }
}

if (failed > 0) {
  console.error(`\n${failed} test file(s) failed.`);
  process.exit(1);
} else {
  console.log('\nAll test files passed.');
}

