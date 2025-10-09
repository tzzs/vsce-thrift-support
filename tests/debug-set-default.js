// Debug script to inspect set default value validation
const assert = require('assert');
const Module = require('module');
const originalRequire = Module.prototype.require;

// Minimal vscode mock
const vscode = {
  DiagnosticSeverity: { Error: 0, Warning: 1, Information: 2, Hint: 3 },
  Position: function (line, character) { return { line, character }; },
  Range: function (startLine, startChar, endLine, endChar) {
    return { start: { line: startLine, character: startChar }, end: { line: endLine, character: endChar } };
  },
};

Module.prototype.require = function (id) { if (id === 'vscode') return vscode; return originalRequire.apply(this, arguments); };
const diagnostics = require('../out/diagnostics');
Module.prototype.require = originalRequire;

console.log('Debugging set default validation...');
const setTest = `struct Test {\n  1: set<string> tags1 = {"tag1", "tag2"},\n  2: set<i32> numbers1 = {1, 2, 3},\n  3: set<string> tags2 = ["tag3", "tag4"],\n  4: set<i32> numbers2 = [4, 5, 6],\n  5: set<string> invalid = "not a set"\n}`;
const issues = diagnostics.analyzeThriftText(setTest);
console.log('Issues:', issues.map(i => i.code));
console.log('Mismatches:', issues.filter(i => i.code === 'value.typeMismatch').length);
console.log('Details:', issues.filter(i => i.code === 'value.typeMismatch').map(i => i.message));