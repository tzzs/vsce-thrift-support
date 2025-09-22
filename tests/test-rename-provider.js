// RenameProvider unit tests with a minimal VSCode mock
const assert = require('assert');
const Module = require('module');
const originalRequire = Module.prototype.require;

class WorkspaceEditMock {
  constructor() { this.edits = []; }
  replace(uri, range, newText) { this.edits.push({ uri, range, newText }); }
}

const vscode = {
  WorkspaceEdit: WorkspaceEditMock,
  Range: function (a, b, c, d) {
    if (typeof a === 'object' && typeof b === 'object') {
      return { start: a, end: b };
    }
    return { start: { line: a, character: b }, end: { line: c, character: d } };
  },
  Position: function (line, character) { return { line, character }; },
};

Module.prototype.require = function (id) {
  if (id === 'vscode') return vscode;
  return originalRequire.apply(this, arguments);
};

const { ThriftRenameProvider } = require('../out/renameProvider.js');
Module.prototype.require = originalRequire;

function createMockDocument(content) {
  const lines = content.split('\n');
  const lineStartOffsets = [];
  let acc = 0;
  for (let i = 0; i < lines.length; i++) {
    lineStartOffsets.push(acc);
    acc += (lines[i] || '').length + (i < lines.length - 1 ? 1 : 0); // +1 for \n except last
  }
  const offsetAt = (pos) => lineStartOffsets[pos.line] + pos.character;
  const getText = (range) => {
    if (!range) return content;
    const start = offsetAt(range.start);
    const end = offsetAt(range.end);
    return content.slice(start, end);
  };
  return {
    uri: { path: '/test.thrift' },
    getText,
    lineCount: lines.length,
    lineAt: (line) => ({ text: lines[line] || '' }),
  };
}

function applyEditsToContent(content, edits) {
  if (!edits || edits.length === 0) return content;
  const lines = content.split('\n');
  // sort by descending positions to avoid offset shifts
  const sorted = edits.slice().sort((a, b) => {
    if (a.range.start.line !== b.range.start.line) return b.range.start.line - a.range.start.line;
    return b.range.start.character - a.range.start.character;
  });
  for (const e of sorted) {
    const { start, end } = e.range;
    if (start.line === end.line) {
      const line = lines[start.line] || '';
      lines[start.line] = line.slice(0, start.character) + e.newText + line.slice(end.character);
    } else {
      // multi-line (not expected here), implement generic replace
      const before = (lines[start.line] || '').slice(0, start.character);
      const after = (lines[end.line] || '').slice(end.character);
      lines.splice(start.line, end.line - start.line + 1, before + e.newText + after);
    }
  }
  return lines.join('\n');
}

function run() {
  console.log('\nRunning rename provider tests...');

  const content = [
    'struct Foo {',
    '  1: i32 fooName,',
    '  2: string fooName_comment,',
    '  // Also mention fooName here',
    '}',
  ].join('\n');
  const doc = createMockDocument(content);

  const provider = new ThriftRenameProvider();

  // position at 'fooName' on line 1
  const pos = new vscode.Position(1, '  1: i32 '.length + 2); // inside word

  const prep = provider.prepareRename(doc, pos);
  assert.ok(prep && prep.range, 'prepareRename should return a range');
  assert.strictEqual(prep.placeholder, 'fooName', 'Placeholder should equal the symbol text');

  return Promise.resolve(provider.provideRenameEdits(doc, pos, 'barName')).then((we) => {
    assert.ok(we, 'Expected a WorkspaceEdit');
    const a = we.edits || [];
    assert.ok(a.length >= 2, 'Should produce at least two edits (symbol + comment)');

    const newText = applyEditsToContent(content, a);
    assert.ok(newText.includes('barName'), 'New name should appear');
    assert.ok(!/\bfooName\b/.test(newText), 'Old name should be fully replaced');
    assert.ok(newText.includes('fooName_comment'), 'Should NOT replace within larger identifiers');

    console.log('Rename provider tests passed.');
  });
}

run().catch(err => { console.error(err); process.exit(1); });
