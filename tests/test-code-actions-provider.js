// CodeActionProvider unit tests with a minimal VSCode mock
const assert = require('assert');
const Module = require('module');
const originalRequire = Module.prototype.require;

class CodeAction {
  constructor(title, kind) {
    this.title = title;
    this.kind = kind;
    this.command = undefined;
  }
}

const vscode = {
  CodeAction,
  CodeActionKind: {
    Refactor: 'refactor',
    RefactorExtract: 'refactor.extract',
    RefactorMove: 'refactor.move',
  },
  Range: function (a, b, c, d) {
    if (typeof a === 'object' && typeof b === 'object') return { start: a, end: b };
    return { start: { line: a, character: b }, end: { line: c, character: d } };
  },
  Selection: function (a, b, c, d) {
    if (typeof a === 'object' && typeof b === 'object') return { start: a, end: b, isEmpty: false };
    return { start: { line: a, character: b }, end: { line: c, character: d }, isEmpty: false };
  },
  Position: function (line, character) { return { line, character }; },
};

Module.prototype.require = function (id) {
  if (id === 'vscode') return vscode;
  return originalRequire.apply(this, arguments);
};

const { ThriftRefactorCodeActionProvider } = require('../out/codeActionsProvider.js');
Module.prototype.require = originalRequire;

function createDoc(languageId = 'thrift', text = 'struct Foo {\n 1: i32 id\n}') {
  const lines = text.split('\n');
  return {
    languageId,
    getText: () => text,
    lineCount: lines.length,
    lineAt: (line) => ({ text: lines[line] || '' }),
    // Avoid triggering workspace search in provider
    getWordRangeAtPosition: () => null,
  };
}

async function run() {
  console.log('\nRunning code action provider tests...');
  const provider = new ThriftRefactorCodeActionProvider();

  const doc = createDoc('thrift');
  const range = new vscode.Selection(new vscode.Position(0, 0), new vscode.Position(0, 6));
  const actions = (await provider.provideCodeActions(doc, range, { only: undefined }, undefined)) || [];

  assert.ok(Array.isArray(actions), 'Expected an array of code actions');
  assert.strictEqual(actions.length, 2, 'Should return two code actions');

  const [extract, move] = actions;
  assert.strictEqual(extract.title, 'Extract type (typedef)');
  assert.strictEqual(extract.kind, vscode.CodeActionKind.RefactorExtract);
  assert.ok(extract.command && extract.command.command === 'thrift.refactor.extractType');

  assert.strictEqual(move.title, 'Move type to file...');
  assert.strictEqual(move.kind, vscode.CodeActionKind.RefactorMove);
  assert.ok(move.command && move.command.command === 'thrift.refactor.moveType');

  // Non-thrift docs should return undefined
  const otherDoc = createDoc('json');
  const none = await provider.provideCodeActions(otherDoc, range, { only: undefined }, undefined);
  assert.strictEqual(none, undefined, 'Non-thrift documents should not provide code actions');

  console.log('Code action provider tests passed.');
}

run();