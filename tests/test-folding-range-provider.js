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

const { ThriftFoldingRangeProvider } = require('../out/foldingRangeProvider.js');

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

function countFoldingRanges(ranges) {
  return ranges.length;
}

async function testBasicStructFolding() {
  console.log('Testing basic struct folding...');

  const provider = new ThriftFoldingRangeProvider();
  const text = `struct User {
  1: required i32 id,
  2: optional string name,
  3: required bool active
}`;
  const document = createMockDocument(text);

  const ranges = await provider.provideFoldingRanges(
    document,
    createMockFoldingContext(),
    createMockCancellationToken()
  );

  if (!Array.isArray(ranges)) {
    throw new Error('Folding ranges not returned as array');
  }

  // Should have one folding range for the struct block
  const structRange = findFoldingRange(ranges, 0, 3);
  if (!structRange) {
    throw new Error('Expected folding range for struct block');
  }

  if (structRange.start !== 0 || structRange.end !== 3) {
    throw new Error(`Expected struct range [0, 3], got [${structRange.start}, ${structRange.end}]`);
  }

  console.log('✓ Basic struct folding test passed');
}

async function testServiceFolding() {
  console.log('Testing service folding...');

  const provider = new ThriftFoldingRangeProvider();
  const text = `service UserService {
  User getUser(1: i32 userId),
  void createUser(1: User user),
  oneway void deleteUser(1: i32 userId)
}`;
  const document = createMockDocument(text);

  const ranges = await provider.provideFoldingRanges(
    document,
    createMockFoldingContext(),
    createMockCancellationToken()
  );

  if (!Array.isArray(ranges)) {
    throw new Error('Folding ranges not returned as array');
  }

  // Should have one folding range for the service block
  const serviceRange = findFoldingRange(ranges, 0, 3);
  if (!serviceRange) {
    throw new Error('Expected folding range for service block');
  }

  console.log('✓ Service folding test passed');
}

async function testEnumFolding() {
  console.log('Testing enum folding...');

  const provider = new ThriftFoldingRangeProvider();
  const text = `enum Status {
  ACTIVE = 1,
  INACTIVE = 2,
  PENDING = 3
}`;
  const document = createMockDocument(text);

  const ranges = await provider.provideFoldingRanges(
    document,
    createMockFoldingContext(),
    createMockCancellationToken()
  );

  if (!Array.isArray(ranges)) {
    throw new Error('Folding ranges not returned as array');
  }

  // Should have one folding range for the enum block
  const enumRange = findFoldingRange(ranges, 0, 3);
  if (!enumRange) {
    throw new Error('Expected folding range for enum block');
  }

  console.log('✓ Enum folding test passed');
}

async function testCommentFolding() {
  console.log('Testing comment folding...');

  const provider = new ThriftFoldingRangeProvider();
  const text = `/* This is a multi-line
   block comment that should
   be foldable */
struct User {
  // This is a single line comment
  1: required i32 id
}`;
  const document = createMockDocument(text);

  const ranges = await provider.provideFoldingRanges(
    document,
    createMockFoldingContext(),
    createMockCancellationToken()
  );

  if (!Array.isArray(ranges)) {
    throw new Error('Folding ranges not returned as array');
  }

  // Should have folding range for the block comment
  const commentRange = findFoldingRange(ranges, 0, 2);
  if (!commentRange) {
    throw new Error('Expected folding range for block comment');
  }

  // Should also have folding range for the struct
  const structRange = findFoldingRange(ranges, 3, 6);
  if (!structRange) {
    throw new Error('Expected folding range for struct block');
  }

  console.log('✓ Comment folding test passed');
}

async function testNestedBlocks() {
  console.log('Testing nested blocks...');

  const provider = new ThriftFoldingRangeProvider();
  const text = `struct User {
  1: required i32 id,
  2: optional list<string> tags,
  3: required map<string, i32> scores
}`;
  const document = createMockDocument(text);

  const ranges = await provider.provideFoldingRanges(
    document,
    createMockFoldingContext(),
    createMockCancellationToken()
  );

  if (!Array.isArray(ranges)) {
    throw new Error('Folding ranges not returned as array');
  }

  // Should have folding range for the main struct block
  const structRange = findFoldingRange(ranges, 0, 3);
  if (!structRange) {
    throw new Error('Expected folding range for struct block');
  }

  console.log('✓ Nested blocks test passed');
}

async function testParenthesesFolding() {
  console.log('Testing parentheses folding...');

  const provider = new ThriftFoldingRangeProvider();
  const text = `service UserService {
  User getUser(1: i32 userId,
               2: string name,
               3: bool active),
  void createUser(1: User user)
}`;
  const document = createMockDocument(text);

  const ranges = await provider.provideFoldingRanges(
    document,
    createMockFoldingContext(),
    createMockCancellationToken()
  );

  if (!Array.isArray(ranges)) {
    throw new Error('Folding ranges not returned as array');
  }

  // Should have folding ranges for service block and possibly parameter lists
  const serviceRange = findFoldingRange(ranges, 0, 4);
  if (!serviceRange) {
    throw new Error('Expected folding range for service block');
  }

  console.log('✓ Parentheses folding test passed');
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

  if (!Array.isArray(ranges)) {
    throw new Error('Folding ranges not returned as array');
  }

  // Should have multiple folding ranges
  if (ranges.length < 3) {
    throw new Error(`Expected at least 3 folding ranges, got ${ranges.length}`);
  }

  // Check for specific ranges
  const hasCommentRange = ranges.some(range => range.start === 2 && range.end === 3);
  const hasUserStructRange = ranges.some(range => range.start === 4 && range.end === 7);
  const hasStatusEnumRange = ranges.some(range => range.start === 9 && range.end === 11);
  const hasServiceRange = ranges.some(range => range.start === 14 && range.end === 18);

  if (!hasCommentRange) {
    throw new Error('Expected folding range for main comment');
  }

  if (!hasUserStructRange) {
    throw new Error('Expected folding range for User struct');
  }

  if (!hasStatusEnumRange) {
    throw new Error('Expected folding range for Status enum');
  }

  if (!hasServiceRange) {
    throw new Error('Expected folding range for UserService');
  }

  console.log('✓ Complex document folding test passed');
}

async function testEmptyDocument() {
  console.log('Testing empty document...');

  const provider = new ThriftFoldingRangeProvider();
  const text = ``;
  const document = createMockDocument(text);

  const ranges = await provider.provideFoldingRanges(
    document,
    createMockFoldingContext(),
    createMockCancellationToken()
  );

  if (!Array.isArray(ranges)) {
    throw new Error('Folding ranges not returned as array for empty document');
  }

  if (ranges.length !== 0) {
    throw new Error(`Expected 0 folding ranges for empty document, got ${ranges.length}`);
  }

  console.log('✓ Empty document folding test passed');
}

async function testSingleLineBlocks() {
  console.log('Testing single-line blocks...');

  const provider = new ThriftFoldingRangeProvider();
  const text = `struct User { 1: required i32 id, 2: optional string name }`;
  const document = createMockDocument(text);

  const ranges = await provider.provideFoldingRanges(
    document,
    createMockFoldingContext(),
    createMockCancellationToken()
  );

  if (!Array.isArray(ranges)) {
    throw new Error('Folding ranges not returned as array');
  }

  // Single-line blocks might not be foldable or might have special handling
  console.log(`Found ${ranges.length} folding ranges for single-line block`);

  console.log('✓ Single-line blocks test passed');
}

async function testBracketsAndLists() {
  console.log('Testing brackets and lists...');

  const provider = new ThriftFoldingRangeProvider();
  const text = `const list<string> NAMES = [
  "Alice",
  "Bob",
  "Charlie"
]

const map<string, i32> SCORES = {
  "Alice": 100,
  "Bob": 95,
  "Charlie": 90
}`;
  const document = createMockDocument(text);

  const ranges = await provider.provideFoldingRanges(
    document,
    createMockFoldingContext(),
    createMockCancellationToken()
  );

  if (!Array.isArray(ranges)) {
    throw new Error('Folding ranges not returned as array');
  }

  // Should have folding ranges for the list and map
  const hasListRange = ranges.some(range => range.start === 0 && range.end === 3);
  const hasMapRange = ranges.some(range => range.start === 5 && range.end === 8);

  if (!hasListRange) {
    throw new Error('Expected folding range for list');
  }

  if (!hasMapRange) {
    throw new Error('Expected folding range for map');
  }

  console.log('✓ Brackets and lists test passed');
}

async function testCancellationToken() {
  console.log('Testing cancellation token...');

  const provider = new ThriftFoldingRangeProvider();

  const text = `struct User {
  1: required i32 id,
  2: optional string name
}

enum Status {
  ACTIVE = 1,
  INACTIVE = 2
}`;
  const document = createMockDocument(text);

  // Test with cancelled token
  const cancelledToken = { isCancellationRequested: true };

  const ranges = await provider.provideFoldingRanges(
    document,
    createMockFoldingContext(),
    cancelledToken
  );

  if (!Array.isArray(ranges)) {
    throw new Error('Folding ranges not returned as array with cancelled token');
  }

  // Should handle cancellation gracefully
  console.log(`Found ${ranges.length} folding ranges with cancelled token`);

  console.log('✓ Cancellation token test passed');
}

async function testStringHandling() {
  console.log('Testing string handling...');

  const provider = new ThriftFoldingRangeProvider();
  const text = `struct User {
  1: required string description = "This is a string with {braces} and (parentheses)",
  2: optional string name
}`;
  const document = createMockDocument(text);

  const ranges = await provider.provideFoldingRanges(
    document,
    createMockFoldingContext(),
    createMockCancellationToken()
  );

  if (!Array.isArray(ranges)) {
    throw new Error('Folding ranges not returned as array');
  }

  // Should handle braces and parentheses inside strings correctly
  const structRange = findFoldingRange(ranges, 0, 2);
  if (!structRange) {
    throw new Error('Expected folding range for struct despite braces in strings');
  }

  console.log('✓ String handling test passed');
}

async function runAllTests() {
  console.log('=== Running Folding Range Provider Tests ===\n');

  try {
    await testBasicStructFolding();
    await testServiceFolding();
    await testEnumFolding();
    await testCommentFolding();
    await testNestedBlocks();
    await testParenthesesFolding();
    await testComplexDocument();
    await testEmptyDocument();
    await testSingleLineBlocks();
    await testBracketsAndLists();
    await testCancellationToken();
    await testStringHandling();

    console.log('\n✅ All folding range provider tests passed!');
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  }
}

runAllTests().catch((error) => {
  console.error('Test execution failed:', error);
  process.exit(1);
});