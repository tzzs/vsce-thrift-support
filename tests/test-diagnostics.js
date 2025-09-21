// Diagnostics unit tests (Node environment with vscode mock)
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
  console.log('\nRunning diagnostics tests...');

  // 1) Duplicate field id within a struct
  const dupId = `struct Foo {\n  1: i32 id,\n  1: i64 id2,\n}`;
  let issues = analyzeThriftText(dupId);
  assert.ok(findByCode(issues, 'field.duplicateId').length === 1, 'Expected one duplicate id error');

  // Field ids reset across structs
  const twoStructs = `struct A {\n  1: i32 x\n}\n\nstruct B {\n  1: i64 y\n}`;
  issues = analyzeThriftText(twoStructs);
  assert.ok(findByCode(issues, 'field.duplicateId').length === 0, 'Field ids should reset per type block');

  // 2) Unknown field type
  const unknownType = `struct Bar {\n  1: FooType name\n}`;
  issues = analyzeThriftText(unknownType);
  assert.ok(findByCode(issues, 'type.unknown').length === 1, 'Unknown type should be flagged');

  // 3) Unknown typedef base type
  const badTypedef = `typedef UnknownBase GoodName`;
  issues = analyzeThriftText(badTypedef);
  assert.ok(findByCode(issues, 'typedef.unknownBase').length === 1, 'Unknown typedef base should be flagged');

  // 4) Container types validate inner types
  const badContainer = `struct C {\n  1: list<UnknownInner> xs\n}`;
  issues = analyzeThriftText(badContainer);
  assert.ok(findByCode(issues, 'type.unknown').length === 1, 'Unknown inner container type should be flagged');

  // 5) Unmatched closer
  const unmatchedCloser = `}`;
  issues = analyzeThriftText(unmatchedCloser);
  assert.ok(findByCode(issues, 'syntax.unmatchedCloser').length === 1, 'Unmatched closer should be flagged');

  // 6) Unclosed opener
  const unclosedOpener = `{`;
  issues = analyzeThriftText(unclosedOpener);
  assert.ok(findByCode(issues, 'syntax.unclosed').length === 1, 'Unclosed opener should be flagged');

  console.log('All diagnostics tests passed.');
}

run();