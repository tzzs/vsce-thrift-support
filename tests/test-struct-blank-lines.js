// Mock vscode module to run formatter without VS Code
const Module = require('module');
const originalRequire = Module.prototype.require;

const vscode = {
  workspace: {
    getConfiguration: (section) => {
      if (section === 'thrift.format') {
        // Provide defaults with our overrides for this test
        const defaults = {
          trailingComma: 'preserve',
          alignTypes: true,
          alignFieldNames: true,

          alignAnnotations: true,
          alignComments: true,
          alignEnumNames: true,
          alignEnumEquals: true,
          alignEnumValues: true,
          indentSize: 2,
          maxLineLength: 100,
          collectionStyle: 'preserve',
        };
        return { get: (key) => defaults[key] };
      } else if (section === 'thrift-support.formatting') {
        // legacy namespace used by some tests; return defaults when requested
        return { get: (key, def) => def };
      }
      return { get: () => undefined };
    },
  },
  TextEdit: {
    replace: (range, newText) => ({ range, newText }),
  },
  Range: function (startLine, startChar, endLine, endChar) {
    return { start: { line: startLine, character: startChar }, end: { line: endLine, character: endChar } };
  },
};

Module.prototype.require = function (id) {
  if (id === 'vscode') return vscode;
  return originalRequire.apply(this, arguments);
};

const { ThriftFormattingProvider } = require('../out/formatter');
Module.prototype.require = originalRequire;

function runTest() {
  const formatter = new ThriftFormattingProvider();

  const input = `struct User {
  1: required UserId id,

  2: required string name,

  // group A
  3: optional Email email,

  4: optional i32 age,

  /* block comment */
  5: optional Status status = Status.ACTIVE,

  6: optional list<string> tags,

  7: optional map<string, string> metadata,

  /** multi */
  8: optional bool isVerified = false,

  9: optional double score = 0.0,

  10: optional binary avatar
}`;

  // Expected according to current formatter rules:
  // - Types are aligned to the longest type within a contiguous group (blank lines/comments split groups)
  // - Field names are padded only within the same group when aligning '=' is meaningful
  // - Generic comma spacing is compacted: map<string,string>
  const expected = `struct User {
  1: required UserId id,

  2: required string name,

  // group A
  3: optional Email email,

  4: optional i32 age,

  /* block comment */
  5: optional Status status = Status.ACTIVE,

  6: optional list<string> tags,

  7: optional map<string,string> metadata,

  /** multi */
  8: optional bool isVerified = false,

  9: optional double score = 0.0,

  10: optional binary avatar
}`;

  const mockDoc = {
    getText: () => input,
  };
  const fullRange = { start: { line: 0, character: 0 }, end: { line: 9999, character: 0 } };
  const options = { insertSpaces: true, tabSize: 2 };

  const edits = formatter.provideDocumentRangeFormattingEdits(mockDoc, fullRange, options);
  if (!edits || edits.length === 0) {
    console.error('No edits returned');
    process.exit(1);
  }
  const output = edits[0].newText;

  // Normalize line endings to avoid CRLF/LF mismatches on Windows
  const normalize = (s) => s
    .replace(/\r\n/g, '\n')
    // remove trailing spaces before line breaks (including on blank lines)
    .replace(/[ \t]+(?=\n)/g, '');
  const outputN = normalize(output).trim();
  const expectedN = normalize(expected).trim();

  // Simple assertion: output should equal expected
  if (outputN !== expectedN) {
    console.error('Formatted output did not match expected.');
    console.log('--- INPUT ---');
    console.log(input);
    console.log('--- OUTPUT ---');
    console.log(output);
    console.log('--- EXPECTED ---');
    console.log(expected);

    // diagnostics
    console.log('--- DIAGNOSTICS ---');
    console.log(`output length=${outputN.length}, expected length=${expectedN.length}`);
    const minLen = Math.min(outputN.length, expectedN.length);
    let diffIndex = -1;
    for (let i = 0; i < minLen; i++) {
      if (outputN.charCodeAt(i) !== expectedN.charCodeAt(i)) { diffIndex = i; break; }
    }
    if (diffIndex === -1 && outputN.length !== expectedN.length) diffIndex = minLen;
    console.log(`first diff at index=${diffIndex}`);
    if (diffIndex >= 0) {
      const oCode = outputN.charCodeAt(diffIndex);
      const eCode = expectedN.charCodeAt(diffIndex);
      console.log(`output char='${outputN[diffIndex]}' code=${oCode}`);
      console.log(`expected char='${expectedN[diffIndex]}' code=${eCode}`);
      // show surrounding context
      const ctxStart = Math.max(0, diffIndex - 20);
      const ctxEnd = Math.min(minLen, diffIndex + 20);
      console.log('output ctx:', JSON.stringify(outputN.slice(ctxStart, ctxEnd)));
      console.log('expected ctx:', JSON.stringify(expectedN.slice(ctxStart, ctxEnd)));
      // line/col
      const outPrefix = outputN.slice(0, diffIndex);
      const line = (outPrefix.match(/\n/g) || []).length + 1;
      const col = diffIndex - (outPrefix.lastIndexOf('\n') + 1) + 1;
      console.log(`at line ${line}, col ${col}`);
    }
    process.exit(1);
  }

  // Additionally, check that blank lines count equals
  const inputBlankLines = (normalize(input).match(/^\s*$/gm) || []).length;
  const outputBlankLines = (normalize(output).match(/^\s*$/gm) || []).length;
  if (inputBlankLines !== outputBlankLines) {
    console.error(`Blank line count changed: input=${inputBlankLines}, output=${outputBlankLines}`);
    process.exit(1);
  }

  console.log('Struct blank lines preservation test PASSED');
}

runTest();