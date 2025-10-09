const fs = require('fs');
const path = require('path');

// Enhanced vscode mock for completion provider testing
const vscode = {
  CompletionItem: class {
    constructor(label, kind) {
      this.label = label;
      this.kind = kind;
    }
  },
  CompletionItemKind: {
    Keyword: 0,
    TypeParameter: 1,
    Class: 2,
    EnumMember: 3,
    Method: 4,
    File: 5,
    Folder: 6
  },
  SnippetString: class {
    constructor(value) {
      this.value = value;
    }
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
  },
  workspace: {
    findFiles: async (pattern, exclude) => {
      // Mock implementation - return some test thrift files
      const patternStr = typeof pattern === 'string' ? pattern : (pattern.pattern || '');
      if (patternStr.includes('*.thrift')) {
        return [
          { fsPath: path.join(__dirname, '..', 'test-files', 'example.thrift') },
          { fsPath: path.join(__dirname, '..', 'test-files', 'shared.thrift') }
        ];
      }
      return [];
    }
  },
  RelativePattern: class {
    constructor(base, pattern) {
      this.base = base;
      this.pattern = pattern;
    }
  },
  Uri: {
    file: (path) => ({ fsPath: path })
  }
};

// Hook require('vscode')
const Module = require('module');
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === 'vscode') return vscode;
  return originalLoad.apply(this, arguments);
};

const { ThriftCompletionProvider } = require('../out/completionProvider.js');

function createMockDocument(text, fileName = 'test.thrift') {
  const lines = text.split('\n');
  return {
    uri: { fsPath: path.join(__dirname, 'test-files', fileName) },
    getText: () => text,
    lineAt: (line) => ({ text: lines[line] || '' }),
    offsetAt: (position) => {
      let offset = 0;
      for (let i = 0; i < position.line; i++) {
        offset += lines[i].length + 1; // +1 for newline
      }
      return offset + position.character;
    }
  };
}

function createMockPosition(line, character) {
  return new vscode.Position(line, character);
}

function createMockCancellationToken() {
  return { isCancellationRequested: false };
}

function createMockCompletionContext() {
  return { triggerKind: 0 }; // Invoke
}

async function testKeywordCompletion() {
  console.log('Testing keyword completion...');

  const provider = new ThriftCompletionProvider();
  const text = `str`;
  const document = createMockDocument(text);
  const position = createMockPosition(0, 3);

  const completions = await provider.provideCompletionItems(
    document,
    position,
    createMockCancellationToken(),
    createMockCompletionContext()
  );

  if (!Array.isArray(completions)) {
    throw new Error('Completions not returned as array');
  }

  // Should suggest "struct" among other keywords
  const hasStruct = completions.some(item => item.label === 'struct');
  if (!hasStruct) {
    throw new Error('Expected "struct" keyword completion');
  }

  console.log('✓ Keyword completion test passed');
}

async function testTypeCompletion() {
  console.log('Testing type completion...');

  const provider = new ThriftCompletionProvider();
  const text = `struct User {
  1: required `;
  const document = createMockDocument(text);
  const position = createMockPosition(1, 13); // After "required "

  // Debug: check what the line looks like
  const lines = text.split('\n');
  const currentLine = lines[position.line];
  const beforeCursor = currentLine.substring(0, position.character);

  console.log('Line at position:', JSON.stringify(currentLine));
  console.log('Position character:', position.character);
  console.log('Line substring up to position:', JSON.stringify(beforeCursor));

  // Test the new prefix extraction logic
  const typePrefixMatch = beforeCursor.match(/\s+(\w*)$/);
  console.log('Type prefix match:', typePrefixMatch);
  if (typePrefixMatch) {
    console.log('Extracted prefix:', JSON.stringify(typePrefixMatch[1]));
  }

  const completions = await provider.provideCompletionItems(
    document,
    position,
    createMockCancellationToken(),
    createMockCompletionContext()
  );

  if (!Array.isArray(completions)) {
    throw new Error('Completions not returned as array');
  }

  // Should suggest primitive types
  const hasString = completions.some(item => item.label === 'string');
  const hasInt = completions.some(item => item.label === 'i32');

  // Debug: print available completions
  console.log('Available completions:', completions.map(item => item.label).slice(0, 10));
  console.log('Total completions:', completions.length);

  // Check if filtering is the issue
  const allPrimitives = ['bool', 'byte', 'i8', 'i16', 'i32', 'i64', 'double', 'string', 'binary', 'uuid', 'slist', 'void'];
  const oldPrefix = '  1: required '.trim().toLowerCase();
  const newPrefix = typePrefixMatch ? typePrefixMatch[1].toLowerCase() : oldPrefix;
  console.log('Old prefix for filtering:', JSON.stringify(oldPrefix));
  console.log('New prefix for filtering:', JSON.stringify(newPrefix));
  console.log('Primitives that would match OLD prefix filtering:');
  allPrimitives.forEach(prim => {
    const matches = prim.toLowerCase().startsWith(oldPrefix);
    console.log(`  ${prim}: ${matches}`);
  });
  console.log('Primitives that would match NEW prefix filtering:');
  allPrimitives.forEach(prim => {
    const matches = prim.toLowerCase().startsWith(newPrefix);
    console.log(`  ${prim}: ${matches}`);
  });

  if (!hasString || !hasInt) {
    throw new Error(`Expected primitive type completions. Has string: ${hasString}, has i32: ${hasInt}`);
  }

  console.log('✓ Type completion test passed');
}

async function testUserTypeCompletion() {
  console.log('Testing user type completion...');

  const provider = new ThriftCompletionProvider();
  const text = `struct User {
  1: required i32 id
}

struct Order {
  1: required `;
  const document = createMockDocument(text);
  const position = createMockPosition(5, 13); // After "required "

  const completions = await provider.provideCompletionItems(
    document,
    position,
    createMockCancellationToken(),
    createMockCompletionContext()
  );

  if (!Array.isArray(completions)) {
    throw new Error('Completions not returned as array');
  }

  // Should suggest the "User" type
  const hasUser = completions.some(item => item.label === 'User');
  if (!hasUser) {
    throw new Error('Expected "User" type completion');
  }

  console.log('✓ User type completion test passed');
}

async function testContainerCompletion() {
  console.log('Testing container completion...');

  const provider = new ThriftCompletionProvider();
  const text = `struct User {
  1: required `;
  const document = createMockDocument(text);
  const position = createMockPosition(1, 13); // After "required "

  const completions = await provider.provideCompletionItems(
    document,
    position,
    createMockCancellationToken(),
    createMockCompletionContext()
  );

  if (!Array.isArray(completions)) {
    throw new Error('Completions not returned as array');
  }

  // Should suggest container types
  const hasList = completions.some(item => item.label === 'list');
  const hasSet = completions.some(item => item.label === 'set');
  const hasMap = completions.some(item => item.label === 'map');

  if (!hasList || !hasSet || !hasMap) {
    throw new Error('Expected container type completions');
  }

  console.log('✓ Container completion test passed');
}

async function testEnumValueCompletion() {
  console.log('Testing enum value completion...');

  const provider = new ThriftCompletionProvider();
  const text = `enum Status {
  ACTIVE = 1,
  INACTIVE = 2
}

struct User {
  1: required Status status = `;
  const document = createMockDocument(text);
  const position = createMockPosition(6, 32); // After "= "

  // Debug: check what the line looks like
  const lines = text.split('\n');
  const currentLine = lines[position.line];
  const beforeCursor = currentLine.substring(0, position.character);

  console.log('Line at position:', JSON.stringify(currentLine));
  console.log('Position character:', position.character);
  console.log('Line substring up to position:', JSON.stringify(beforeCursor));

  const completions = await provider.provideCompletionItems(
    document,
    position,
    createMockCancellationToken(),
    createMockCompletionContext()
  );

  if (!Array.isArray(completions)) {
    throw new Error('Completions not returned as array');
  }

  // Debug: print available completions
  console.log('Available completions:', completions.map(item => item.label));
  console.log('Total completions:', completions.length);

  // Should suggest enum values
  const hasActive = completions.some(item => item.label === 'ACTIVE');
  const hasInactive = completions.some(item => item.label === 'INACTIVE');

  if (!hasActive || !hasInactive) {
    throw new Error('Expected enum value completions');
  }

  console.log('✓ Enum value completion test passed');
}

async function testNamespaceCompletion() {
  console.log('Testing namespace completion...');

  const provider = new ThriftCompletionProvider();
  const text = `namespace `;
  const document = createMockDocument(text);
  const position = createMockPosition(0, 10); // After "namespace "

  // Debug: check what the line looks like
  const lines = text.split('\n');
  const currentLine = lines[position.line];
  const beforeCursor = currentLine.substring(0, position.character);

  console.log('Line at position:', JSON.stringify(currentLine));
  console.log('Position character:', position.character);
  console.log('Line substring up to position:', JSON.stringify(beforeCursor));

  const completions = await provider.provideCompletionItems(
    document,
    position,
    createMockCancellationToken(),
    createMockCompletionContext()
  );

  if (!Array.isArray(completions)) {
    throw new Error('Completions not returned as array');
  }

  // Debug: print available completions
  console.log('Available completions:', completions.map(item => item.label));
  console.log('Total completions:', completions.length);

  // Should suggest namespace languages
  const hasJava = completions.some(item => item.label === 'java_package');
  const hasCpp = completions.some(item => item.label === 'cpp');
  const hasPy = completions.some(item => item.label === 'py');

  if (!hasJava || !hasCpp || !hasPy) {
    throw new Error('Expected namespace language completions');
  }

  console.log('✓ Namespace completion test passed');
}

async function testMethodCompletion() {
  console.log('Testing method completion...');

  const provider = new ThriftCompletionProvider();
  const text = `service UserService {
  g`;
  const document = createMockDocument(text);
  const position = createMockPosition(1, 3); // After "g"

  // Debug: check what the line looks like
  const lines = text.split('\n');
  const currentLine = lines[position.line];
  const beforeCursor = currentLine.substring(0, position.character);

  console.log('Line at position:', JSON.stringify(currentLine));
  console.log('Position character:', position.character);
  console.log('Line substring up to position:', JSON.stringify(beforeCursor));

  const completions = await provider.provideCompletionItems(
    document,
    position,
    createMockCancellationToken(),
    createMockCompletionContext()
  );

  if (!Array.isArray(completions)) {
    throw new Error('Completions not returned as array');
  }

  // Debug: print available completions
  console.log('Available completions:', completions.map(item => item.label));
  console.log('Total completions:', completions.length);

  // Should suggest common method names that start with 'g'
  const hasGet = completions.some(item => item.label === 'get');
  const hasSet = completions.some(item => item.label === 'set');
  const hasCreate = completions.some(item => item.label === 'create');

  if (!hasGet) {
    throw new Error('Expected "get" method name completion');
  }

  console.log('✓ Method completion test passed');
}

async function testContextAwareCompletion() {
  console.log('Testing context-aware completion...');

  const provider = new ThriftCompletionProvider();

  // Test 1: In include context
  const includeText = `include "`;
  const includeDoc = createMockDocument(includeText);
  const includePos = createMockPosition(0, 9); // After `"`

  const includeCompletions = await provider.provideCompletionItems(
    includeDoc,
    includePos,
    createMockCancellationToken(),
    createMockCompletionContext()
  );

  if (!Array.isArray(includeCompletions)) {
    throw new Error('Include completions not returned as array');
  }

  console.log('✓ Context-aware include completion test passed');

  // Test 2: In type context vs keyword context
  const fieldText = `struct User {
  1: req`;
  const fieldDoc = createMockDocument(fieldText);
  const fieldPos = createMockPosition(1, 7); // After "req"

  // Debug: check what the line looks like
  const fieldLines = fieldText.split('\n');
  const fieldCurrentLine = fieldLines[fieldPos.line];
  const fieldBeforeCursor = fieldCurrentLine.substring(0, fieldPos.character);

  console.log('Field line at position:', JSON.stringify(fieldCurrentLine));
  console.log('Field position character:', fieldPos.character);
  console.log('Field line substring up to position:', JSON.stringify(fieldBeforeCursor));

  const fieldCompletions = await provider.provideCompletionItems(
    fieldDoc,
    fieldPos,
    createMockCancellationToken(),
    createMockCompletionContext()
  );

  if (!Array.isArray(fieldCompletions)) {
    throw new Error('Field completions not returned as array');
  }

  // Debug: print available completions
  console.log('Field completions:', fieldCompletions.map(item => item.label));
  console.log('Field total completions:', fieldCompletions.length);

  // Should suggest "required" in this context
  const hasRequired = fieldCompletions.some(item => item.label === 'required');
  if (!hasRequired) {
    throw new Error('Expected "required" completion in field context');
  }

  console.log('✓ Context-aware field completion test passed');
}

async function runAllTests() {
  console.log('=== Running Completion Provider Tests ===\n');

  try {
    await testKeywordCompletion();
    await testTypeCompletion();
    await testUserTypeCompletion();
    await testContainerCompletion();
    await testEnumValueCompletion();
    await testNamespaceCompletion();
    await testMethodCompletion();
    await testContextAwareCompletion();

    console.log('\n✅ All completion provider tests passed!');
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  }
}

runAllTests().catch((error) => {
  console.error('Test execution failed:', error);
  process.exit(1);
});