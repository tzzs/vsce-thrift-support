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
  console.log('Running union semantics tests...');

  // Test 1: Union field with default value should be flagged
  const unionWithDefaults = `union MyUnion {
    1: string name = "default",
    2: i32 age = 25,
    3: bool active = true
  }`;
  let issues = analyzeThriftText(unionWithDefaults);
  console.log('Union with defaults issues:', issues.map(i => i.code));
  assert.ok(findByCode(issues, 'union.defaultNotAllowed').length >= 1, 'Union fields with default values should be flagged');

  // Test 2: Union field without default value should be OK
  const unionWithoutDefaults = `union ValidUnion {
    1: string name,
    2: i32 age,
    3: bool active
  }`;
  issues = analyzeThriftText(unionWithoutDefaults);
  customAssert(findByCode(issues, 'union.defaultNotAllowed').length === 0, 'Union fields without defaults should be valid');

  // Test 3: Struct field with default value should be OK
  const structWithDefaults = `struct MyStruct {
    1: string name = "default",
    2: i32 age = 25,
    3: bool active = true
  }`;
  issues = analyzeThriftText(structWithDefaults);
  customAssert(findByCode(issues, 'union.defaultNotAllowed').length === 0, 'Struct fields with default values should be valid');
  customAssert(findByCode(issues, 'value.typeMismatch').length === 0, 'Struct field defaults should have valid types');

  // Test 4: Exception field with default value should be OK
  const exceptionWithDefaults = `exception MyException {
    1: string message = "error",
    2: i32 code = 500
  }`;
  issues = analyzeThriftText(exceptionWithDefaults);
  customAssert(findByCode(issues, 'union.defaultNotAllowed').length === 0, 'Exception fields with default values should be valid');

  // Test 5: Mixed union and struct in same file
  const mixedTypes = `union MixedUnion {
    1: string name,
    2: i32 count = 10  // This should be flagged
  }
  
  struct MixedStruct {
    1: string title = "test",  // This should be OK
    2: i32 value
  }`;
  issues = analyzeThriftText(mixedTypes);
  customAssert(findByCode(issues, 'union.defaultNotAllowed').length === 1, 'Only union field with default should be flagged');

  // Test 6: Union with complex types and defaults
  const complexUnionWithDefaults = `union ComplexUnion {
    1: list<string> items = ["a", "b"],
    2: map<string, i32> mapping = {"key": 1},
    3: set<i32> numbers = [1, 2, 3]
  }`;
  issues = analyzeThriftText(complexUnionWithDefaults);
  console.log('Complex union issues:', issues.map(i => i.code));
  customAssert(findByCode(issues, 'union.defaultNotAllowed').length >= 1, 'Union fields with default values should be flagged');

  // Test 7: Nested union in struct (union field still cannot have defaults)
  const nestedUnionCase = `struct Container {
    1: MyUnion data = {"field": "value"}  // This should be OK (struct field)
  }
  
  union MyUnion {
    1: string field = "default",  // This should be flagged (union field)
    2: i32 number
  }`;
  issues = analyzeThriftText(nestedUnionCase);
  customAssert(findByCode(issues, 'union.defaultNotAllowed').length === 1, 'Only union field with default should be flagged');

  console.log('All union semantics tests passed.');
}

function customAssert(condition, message) {
  if (!condition) {
    console.error('❌ Assertion failed:', message);
    process.exit(1);
  }
}

run();