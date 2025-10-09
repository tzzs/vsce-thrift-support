// Diagnostics unit test: service extends with namespaced parent
const assert = require('assert');
const Module = require('module');
const originalRequire = Module.prototype.require;

// Minimal vscode mock to satisfy diagnostics module
const vscode = {
  DiagnosticSeverity: {
    Error: 0,
    Warning: 1,
    Information: 2,
    Hint: 3,
  },
  Position: function (line, character) { return { line, character }; },
  Range: function (startLine, startChar, endLine, endChar) {
    return { start: { line: startLine, character: startChar }, end: { line: endLine, character: endChar } };
  },
};

Module.prototype.require = function (id) {
  if (id === 'vscode') return vscode;
  return originalRequire.apply(this, arguments);
};

const { analyzeThriftText } = require('../out/diagnostics');
Module.prototype.require = originalRequire;

function findByCode(issues, code) {
  return issues.filter(i => i.code === code);
}

function run() {
  console.log('\nRunning namespaced extends diagnostics test...');

  const text = [
    'service SharedService {}',
    'service UserService extends shared.SharedService {}',
  ].join('\n');

  const issues = analyzeThriftText(text);

  assert.strictEqual(findByCode(issues, 'service.extends.unknown').length, 0, 'should recognize namespaced parent service');
  assert.strictEqual(findByCode(issues, 'service.extends.notService').length, 0, 'parent should be recognized as service');

  console.log('✓ Namespaced extends test passed');
}

run();