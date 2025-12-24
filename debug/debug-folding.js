const fs = require('fs');
const path = require('path');

// Enhanced vscode mock for folding range provider testing
const vscode = {
  FoldingRange: class {
    constructor(startLine, endLine, kind) {
      this.start = startLine;
      this.end = endLine;
      this.kind = kind;
    }
  },
  FoldingRangeKind: {
    Comment: 1,
    Imports: 2,
    Region: 3
  },
  Range: class {
    constructor(startLine, startChar, endLine, endChar) {
      this.start = { line: startLine, character: startChar };
      this.end = { line: endLine, character: endChar };
    }
  },
  Position: class {
    constructor(line, character) {
      this.line = line;
      this.character = character;
    }
  }
};

// Hook require('vscode')
const Module = require('module');
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === 'vscode') return vscode;
  return originalLoad.apply(this, arguments);
};

const { ThriftFoldingRangeProvider } = require('./out/src/foldingRangeProvider.js');

function createMockDocument(text, fileName = 'test.thrift') {
  const lines = text.split('\n');
  return {
    uri: { fsPath: path.join(__dirname, 'test-files', fileName) },
    getText: () => text,
    lineAt: (line) => ({ text: lines[line] || '' })
  };
}

function createMockCancellationToken() {
  return { isCancellationRequested: false };
}

function createMockFoldingContext() {
  return {};
}

function findFoldingRange(ranges, startLine, endLine) {
  return ranges.find(range => range.start === startLine && range.end === endLine);
}

async function testComplexDocument() {
  console.log('Testing complex document...');

  const provider = new ThriftFoldingRangeProvider();
  const text = `namespace java com.example

/* Main data structures */
struct User {
  1: required i32 id,
  2: optional string name,
  3: required Status status
}

enum Status {
  ACTIVE = 1,
  INACTIVE = 2
}

// User service interface
service UserService {
  User getUser(1: i32 userId),
  void createUser(1: User user),
  Status getUserStatus(1: i32 userId)
}

const i32 MAX_USERS = 1000`;
  const document = createMockDocument(text);

  const ranges = await provider.provideFoldingRanges(
    document,
    createMockFoldingContext(),
    createMockCancellationToken()
  );

  console.log(`Found ${ranges.length} folding ranges:`);
  ranges.forEach((range, index) => {
    console.log(`${index + 1}. Start: ${range.start}, End: ${range.end}`);
  });

  // Check for specific ranges
  const hasCommentRange = ranges.some(range => range.start === 2 && range.end === 3);
  const hasUserStructRange = ranges.some(range => range.start === 4 && range.end === 7);
  const hasStatusEnumRange = ranges.some(range => range.start === 9 && range.end === 11);
  const hasServiceRange = ranges.some(range => range.start === 14 && range.end === 18);

  console.log(`Has comment range [2, 3]: ${hasCommentRange}`);
  console.log(`Has User struct range [4, 7]: ${hasUserStructRange}`);
  console.log(`Has Status enum range [9, 11]: ${hasStatusEnumRange}`);
  console.log(`Has service range [14, 18]: ${hasServiceRange}`);

  if (ranges.length < 3) {
    console.log(`Expected at least 3 folding ranges, got ${ranges.length}`);
  } else {
    console.log('Good: Found at least 3 folding ranges');
  }
}

testComplexDocument().catch(console.error);