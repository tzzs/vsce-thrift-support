/*
  Edge case tests for include/namespace navigation:
  - Duplicate include lines: clicking namespace should go to the first matching include.
  - Similar prefix includes (shared vs shared-common): namespace "shared" must resolve to include "shared.thrift" not "shared-common.thrift".
  - Single-quoted include path support.
  - Generics with namespaced types.
  - Clicking on the dot should not navigate.
*/

const assert = require('assert');
const path = require('path');

// Minimal VSCode API shims used by provider and tests
class Position { constructor(line, character) { this.line = line; this.character = character; } }
class Range {
  constructor(a, b, c, d) {
    if (a instanceof Position && b instanceof Position) {
      this.start = a;
      this.end = b;
    } else if (typeof a === 'number' && typeof b === 'number' && typeof c === 'number' && typeof d === 'number') {
      this.start = new Position(a, b);
      this.end = new Position(c, d);
    } else {
      // Fallback: try to coerce
      this.start = a && typeof a.line === 'number' && typeof a.character === 'number' ? new Position(a.line, a.character) : new Position(0, 0);
      this.end = b && typeof b.line === 'number' && typeof b.character === 'number' ? new Position(b.line, b.character) : new Position(0, 0);
    }
  }
}
class Location { constructor(uri, position) { this.uri = uri; this.range = { start: position, end: position }; } }
class Uri { static file(fsPath) { return { fsPath, toString: () => `file://${fsPath}` }; } }

// Mock workspace with in-memory openTextDocument & findFiles
const fs = require('fs');
const workspace = {
  async openTextDocument(file) {
    const fsPath = typeof file === 'string' ? file : file.fsPath;
    const text = fs.readFileSync(fsPath, 'utf8');
    const lines = text.split('\n');
    return {
      uri: { fsPath },
      getText: () => text,
      lineAt: (line) => ({ text: lines[line] || '' }),
      getWordRangeAtPosition: (position) => {
        const lineText = lines[position.line] || '';
        let s = position.character, e = position.character;
        while (s > 0 && /\w/.test(lineText[s - 1])) s--;
        while (e < lineText.length && /\w/.test(lineText[e])) e++;
        if (s === e) return undefined;
        return new Range(position.line, s, position.line, e);
      }
    };
  },
  async findFiles(glob) {
    // enumerate test-files directory
    const dir = path.resolve(__dirname, '..', 'test-files');
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.thrift'));
    return files.map(f => ({ fsPath: path.join(dir, f) }));
  },
  fs: { async stat(uri) { fs.statSync(uri.fsPath); } }
};

// Patch requires inside provider
const Module = require('module');
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === 'vscode') {
    return { Position, Range, Location, Uri, workspace };
  }
  return originalLoad.apply(this, arguments);
};

const { ThriftDefinitionProvider } = require('../out/definitionProvider');

function openDoc(rel) {
  const fsPath = path.resolve(__dirname, '..', rel);
  return workspace.openTextDocument(fsPath);
}

async function testDuplicateIncludeNavigatesToFirst() {
  const doc = await openDoc('test-files/main-edge.thrift');
  const provider = new ThriftDefinitionProvider();
  // Line 6: "  1: required shared.SharedStruct a,"
  const line = 6; // 0-indexed
  const nsStart = doc.lineAt(line).text.indexOf('shared');
  const pos = new Position(line, nsStart + 1); // on namespace
  const loc = await provider.provideDefinition(doc, pos, {});
  assert(loc, 'Expected navigation from namespace');
  assert.strictEqual(path.basename(loc.uri.fsPath), 'main-edge.thrift', 'Should navigate within same file');
  assert.strictEqual(loc.range.start.line, 0, 'Should navigate to first include line (include "shared.thrift")');
}

async function testSimilarPrefixResolvesCorrectly() {
  const doc = await openDoc('test-files/main-edge.thrift');
  const provider = new ThriftDefinitionProvider();
  // Click type: should end up in shared.thrift, not shared-common.thrift
  const line = 6;
  const typeIdx = doc.lineAt(line).text.indexOf('SharedStruct');
  const pos = new Position(line, typeIdx + 1);
  const loc = await provider.provideDefinition(doc, pos, {});
  assert(loc, 'Expected definition for type');
  assert.strictEqual(path.basename(loc.uri.fsPath), 'shared.thrift');
}

async function testSingleQuotedIncludeClickable() {
  // Create a temp file with single quoted include
  const tmp = path.resolve(__dirname, '..', 'test-files', 'tmp-single-quote.thrift');
  fs.writeFileSync(tmp, "include 'shared.thrift'\nstruct A { 1: required shared.SharedStruct a }\n");
  try {
    const doc = await workspace.openTextDocument(tmp);
    const provider = new ThriftDefinitionProvider();
    const line0 = (doc.getText().split('\n'))[0];
    const qStart = line0.indexOf("'");
    const pos = new Position(0, qStart + 1);
    const loc = await provider.provideDefinition(doc, pos, {});
    assert(loc, 'Expected navigation from single-quoted include');
    assert.strictEqual(path.basename(loc.uri.fsPath), 'shared.thrift');
  } finally {
    fs.unlinkSync(tmp);
  }
}

async function testClickDotDoesNotNavigate() {
  const doc = await openDoc('test-files/main-edge.thrift');
  const provider = new ThriftDefinitionProvider();
  const line = 6;
  const dotIdx = doc.lineAt(line).text.indexOf('.');
  const pos = new Position(line, dotIdx); // directly on dot
  const loc = await provider.provideDefinition(doc, pos, {});
  assert.strictEqual(loc, undefined, 'Clicking on dot should not navigate');
}

async function testGenericsTypeClick() {
  const doc = await openDoc('test-files/main-edge.thrift');
  const provider = new ThriftDefinitionProvider();
  const line = 6; // list<shared.SharedStruct>
  const typeIdx = doc.lineAt(line).text.indexOf('SharedStruct');
  const pos = new Position(line, typeIdx + 1);
  const loc = await provider.provideDefinition(doc, pos, {});
  assert(loc, 'Expected navigation for generic type');
  assert.strictEqual(path.basename(loc.uri.fsPath), 'shared.thrift');
}

async function run() {
  const tests = [
    testDuplicateIncludeNavigatesToFirst,
    testSimilarPrefixResolvesCorrectly,
    testSingleQuotedIncludeClickable,
    testClickDotDoesNotNavigate,
    testGenericsTypeClick,
  ];

  for (const t of tests) {
    try {
      await t();
      console.log('✓', t.name);
    } catch (e) {
      console.error('✗', t.name, e && e.stack || e);
      process.exit(1);
    }
  }
  console.log('All edge case tests passed.');
}

if (require.main === module) {
  run();
}
