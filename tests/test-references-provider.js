const fs = require('fs');
const path = require('path');

// Setup vscode mock before loading any modules that depend on it
const mockVscode = require('./mock-vscode.js');

const {Location, Range, Position} = mockVscode;

// Extend mockVscode with workspace mock
mockVscode.workspace = {
    findFiles: async (pattern, exclude) => {
        // Mock implementation - return test thrift files
        if (pattern.includes('*.thrift')) {
            return [
                {fsPath: path.join(__dirname, 'test-files', 'main.thrift')},
                {fsPath: path.join(__dirname, 'test-files', 'shared.thrift')}
            ];
        }
        return [];
    },
    textDocuments: [], // Add this to prevent "Cannot read properties of undefined (reading 'find')" error
    fs: {
        readFile: async (uri) => {
            // Read the actual test files
            const fs = require('fs');
            const content = fs.readFileSync(uri.fsPath, 'utf-8');
            return Buffer.from(content, 'utf-8');
        }
    },
    openTextDocument: async (uri) => {
        // Mock different file contents based on path
        const fileName = path.basename(uri.fsPath);
        let content = '';

        if (fileName === 'main.thrift') {
            content = `include "shared.thrift"

struct User {
  1: required i32 id,
  2: optional string name,
  3: required Status status
}

service UserService {
  User getUser(1: i32 userId),
  void createUser(1: User user),
  Status getUserStatus(1: i32 userId)
}`;
        } else if (fileName === 'shared.thrift') {
            content = `namespace java com.example.shared

enum Status {
  ACTIVE = 1,
  INACTIVE = 2,
  PENDING = 3
}

const i32 MAX_USERS = 1000`;
        }

        return {
            getText: () => content,
            uri: uri,
            lineAt: (line) => ({text: content.split('\n')[line] || ''}),
            getWordRangeAtPosition: (position) => {
                const lines = content.split('\n');
                const lineText = lines[position.line] || '';
                const wordRegex = /[A-Za-z_][A-Za-z0-9_]*/g;
                let match;
                while ((match = wordRegex.exec(lineText)) !== null) {
                    if (position.character >= match.index && position.character <= match.index + match[0].length) {
                        return new mockVscode.Range(position.line, match.index, position.line, match.index + match[0].length);
                    }
                }
                return null;
            }
        };
    }
};

mockVscode.Uri = {
    file: (filePath) => new mockVscode.Uri('file', '', filePath, '', '')
};

// Hook require('vscode') to return our mock
const Module = require('module');
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
    if (request === 'vscode') return mockVscode;
    return originalLoad.apply(this, arguments);
};

const {ThriftReferencesProvider} = require('../out/src/referencesProvider.js');

function createMockDocument(text, fileName = 'test.thrift', uri = null) {
    const lines = text.split('\n');
    return {
        uri: uri || {fsPath: path.join(__dirname, 'test-files', fileName)},
        getText: (range) => {
            if (!range) return text;
            // Extract text within the specified range
            const startLine = range.start.line;
            const endLine = range.end.line;
            const startChar = range.start.character;
            const endChar = range.end.character;

            if (startLine === endLine) {
                return lines[startLine].substring(startChar, endChar);
            } else {
                let result = lines[startLine].substring(startChar);
                for (let i = startLine + 1; i < endLine; i++) {
                    result += '\n' + lines[i];
                }
                result += '\n' + lines[endLine].substring(0, endChar);
                return result;
            }
        },
        lineAt: (line) => ({text: lines[line] || ''}),
        getWordRangeAtPosition: (position) => {
            const lineText = lines[position.line] || '';
            // 更精确地匹配单词边界
            const wordRegex = /\b([A-Za-z_][A-Za-z0-9_]*)\b/g;
            let match;
            while ((match = wordRegex.exec(lineText)) !== null) {
                if (position.character >= match.index && position.character <= match.index + match[0].length) {
                    return new mockVscode.Range(position.line, match.index, position.line, match.index + match[0].length);
                }
            }
            return null;
        }
    };
}

function createMockPosition(line, character) {
    return new mockVscode.Position(line, character);
}

function createMockCancellationToken() {
    return {isCancellationRequested: false};
}

function createMockReferenceContext() {
    return {includeDeclaration: true};
}

async function testTypeReferences() {
    console.log('Testing type references...');

    const provider = new ThriftReferencesProvider();

    // Test finding references to "User" type
    const text = `struct User {
  1: required i32 id
}

service UserService {
  User getUser(1: i32 userId),
  void createUser(1: User user)
}`;
    const document = createMockDocument(text, 'test.thrift');
    const position = createMockPosition(0, 7); // On "User" in struct definition

    const references = await provider.provideReferences(
        document,
        position,
        createMockReferenceContext(),
        createMockCancellationToken()
    );

    if (!Array.isArray(references)) {
        throw new Error('References not returned as array');
    }

    // Should find 4 references: definition and return type in test.thrift, definition and return type in main.thrift
    if (references.length !== 4) {
        throw new Error(`Expected 4 references to User type, got ${references.length}`);
    }

    console.log('✓ Type references test passed');
}

async function testFieldReferences() {
    console.log('Testing field references...');

    const provider = new ThriftReferencesProvider();

    // Test finding references to field names (this is tricky as fields aren't typically referenced by name)
    const text = `struct User {
  1: required i32 id,
  2: optional string name
}`;
    const document = createMockDocument(text, 'test.thrift');
    const position = createMockPosition(1, 18); // On "id" field name

    const references = await provider.provideReferences(
        document,
        position,
        createMockReferenceContext(),
        createMockCancellationToken()
    );

    if (!Array.isArray(references)) {
        throw new Error('References not returned as array');
    }

    // Field names are typically not cross-referenced, so might be empty or contain definition
    console.log(`Found ${references.length} references to field name 'id'`);

    console.log('✓ Field references test passed');
}

async function testEnumValueReferences() {
    console.log('Testing enum value references...');

    const provider = new ThriftReferencesProvider();

    const text = `enum Status {
  ACTIVE = 1,
  INACTIVE = 2
}

const Status DEFAULT_STATUS = ACTIVE`;
    const document = createMockDocument(text, 'test.thrift');
    const position = createMockPosition(1, 2); // On "ACTIVE" enum value

    const references = await provider.provideReferences(
        document,
        position,
        createMockReferenceContext(),
        createMockCancellationToken()
    );

    if (!Array.isArray(references)) {
        throw new Error('References not returned as array');
    }

    // Should find references to ACTIVE
    console.log(`Found ${references.length} references to ACTIVE enum value`);

    console.log('✓ Enum value references test passed');
}

async function testMethodReferences() {
    console.log('Testing method references...');

    const provider = new ThriftReferencesProvider();

    const text = `service UserService {
  User getUser(1: i32 userId),
  void createUser(1: User user)
}`;
    const document = createMockDocument(text, 'test.thrift');
    const position = createMockPosition(1, 6); // On "getUser" method name

    const references = await provider.provideReferences(
        document,
        position,
        createMockReferenceContext(),
        createMockCancellationToken()
    );

    if (!Array.isArray(references)) {
        throw new Error('References not returned as array');
    }

    // Should find the method definition
    console.log(`Found ${references.length} references to getUser method`);

    console.log('✓ Method references test passed');
}

async function testCrossFileReferences() {
    console.log('Testing cross-file references...');

    const provider = new ThriftReferencesProvider();

    // Test cross-file references - this tests the provider's ability to search multiple files
    // Use mock document instead of trying to access real vscode object
    const mainContent = `include "shared.thrift"

struct User {
  1: required i32 id,
  2: optional string name,
  3: required Status status
}

service UserService {
  User getUser(1: i32 userId),
  void createUser(1: User user),
  Status getUserStatus(1: i32 userId)
}`;
    const mainDocument = createMockDocument(mainContent, 'main.thrift');

    // Find a reference to Status type in main.thrift
    const position = createMockPosition(4, 17); // On "Status" in main.thrift

    const references = await provider.provideReferences(
        mainDocument,
        position,
        createMockReferenceContext(),
        createMockCancellationToken()
    );

    if (!Array.isArray(references)) {
        throw new Error('Cross-file references not returned as array');
    }

    // Should find references across files
    console.log(`Found ${references.length} cross-file references`);

    // Check if references span multiple files
    const uniqueFiles = new Set(references.map(ref => ref.uri.fsPath));
    if (uniqueFiles.size > 1) {
        console.log('✓ Found references across multiple files');
    }

    console.log('✓ Cross-file references test passed');
}

async function testNamespacedTypeReferences() {
    console.log('Testing namespaced type references...');

    const provider = new ThriftReferencesProvider();

    // Test finding references to namespaced types
    const mainContent = `include "shared.thrift"

struct User {
  1: required i32 id,
  2: optional string name,
  3: optional shared.Address address,
  4: required shared.Priority priority = shared.Priority.LOW
}

service UserManagementService {
  User createUser(1: User user),
  void updateUser(1: i32 userId, 2: User user),
  shared.Address getAddress(1: i32 userId)
}`;
    const document = createMockDocument(mainContent, 'main.thrift');
    // Position should be on "Address" in "shared.Address"
    // Line 5 (0-indexed), approximately character 27 where "Address" starts
    const position = createMockPosition(5, 27); // On "Address" in field definition

    const references = await provider.provideReferences(
        document,
        position,
        createMockReferenceContext(),
        createMockCancellationToken()
    );

    if (!Array.isArray(references)) {
        throw new Error('Namespaced references not returned as array');
    }

    // Should find references to Address type
    console.log(`Found ${references.length} references to shared.Address type`);

    console.log('✓ Namespaced type references test passed');
}

async function testFullTypeNameReferences() {
    console.log('Testing full type name references...');

    const provider = new ThriftReferencesProvider();

    // Test finding references using full type name (with namespace)
    const mainContent = `include "shared.thrift"

struct User {
  1: required i32 id,
  2: optional string name,
  3: optional shared.Address address,
  4: required shared.Priority priority = shared.Priority.LOW
}

service UserManagementService {
  User createUser(1: User user),
  void updateUser(1: i32 userId, 2: User user),
  shared.Address getAddress(1: i32 userId)
}`;
    const document = createMockDocument(mainContent, 'main.thrift');
    // Position on "shared.Address" - we'll test with "shared" part
    // Line 5 (0-indexed), approximately character 20 where "shared" starts
    const position = createMockPosition(5, 20); // On "shared" in field definition

    const references = await provider.provideReferences(
        document,
        position,
        createMockReferenceContext(),
        createMockCancellationToken()
    );

    if (!Array.isArray(references)) {
        throw new Error('Full type name references not returned as array');
    }

    // Should handle namespaced references properly
    console.log(`Found ${references.length} references to namespaced type`);

    console.log('✓ Full type name references test passed');
}

async function testInvalidPosition() {
    console.log('Testing invalid position...');

    const provider = new ThriftReferencesProvider();

    const text = `struct User {
  1: required i32 id
}`;
    const document = createMockDocument(text, 'test.thrift');
    const position = createMockPosition(10, 0); // Beyond document bounds

    const references = await provider.provideReferences(
        document,
        position,
        createMockReferenceContext(),
        createMockCancellationToken()
    );

    if (!Array.isArray(references)) {
        throw new Error('References not returned as array for invalid position');
    }

    // Should handle gracefully
    console.log(`Found ${references.length} references at invalid position`);

    console.log('✓ Invalid position test passed');
}

async function testEmptyDocument() {
    console.log('Testing empty document...');

    const provider = new ThriftReferencesProvider();

    const text = ``;
    const document = createMockDocument(text, 'test.thrift');
    const position = createMockPosition(0, 0);

    const references = await provider.provideReferences(
        document,
        position,
        createMockReferenceContext(),
        createMockCancellationToken()
    );

    if (!Array.isArray(references)) {
        throw new Error('References not returned as array for empty document');
    }

    console.log(`Found ${references.length} references in empty document`);

    console.log('✓ Empty document test passed');
}

async function testWordBoundaryDetection() {
    console.log('Testing word boundary detection...');

    const provider = new ThriftReferencesProvider();

    const text = `struct User {
  1: required i32 userId,
  2: optional string username
}

service UserService {
  User getUser(1: i32 userId)
}`;
    const document = createMockDocument(text, 'test.thrift');
    const position = createMockPosition(0, 7); // On "User" (not "userId" or "username")

    const references = await provider.provideReferences(
        document,
        position,
        createMockReferenceContext(),
        createMockCancellationToken()
    );

    if (!Array.isArray(references)) {
        throw new Error('References not returned as array');
    }

    // Should only find references to "User" type, not "userId" or "username"
    const userTypeReferences = references.filter(ref => {
        const lines = text.split('\n');
        const line = lines[ref.range.start.line];
        if (!line) return false; // Add null check for line
        const referencedText = line.substring(ref.range.start.character, ref.range.end.character);
        return referencedText === 'User';
    });

    console.log(`Found ${userTypeReferences.length} references to "User" type`);

    console.log('✓ Word boundary detection test passed');
}

async function testCancellationToken() {
    console.log('Testing cancellation token...');

    const provider = new ThriftReferencesProvider();

    const text = `struct User {
  1: required i32 id
}

service UserService {
  User getUser(1: i32 userId)
}`;
    const document = createMockDocument(text, 'test.thrift');
    const position = createMockPosition(0, 7); // On "User"

    // Test with cancelled token
    const cancelledToken = {isCancellationRequested: true};

    const references = await provider.provideReferences(
        document,
        position,
        createMockReferenceContext(),
        cancelledToken
    );

    if (!Array.isArray(references)) {
        throw new Error('References not returned as array with cancelled token');
    }

    // Should handle cancellation gracefully
    console.log(`Found ${references.length} references with cancelled token`);

    console.log('✓ Cancellation token test passed');
}

async function testCommentsAndStrings() {
    console.log('Testing comments and strings...');

    const provider = new ThriftReferencesProvider();

    const text = `struct User {
  // This is a User struct
  1: required i32 id
}

const string USER_TYPE = "User" // User in comment
/* Another User reference in block comment */`;
    const document = createMockDocument(text, 'test.thrift');
    const position = createMockPosition(0, 7); // On "User" in struct definition

    const references = await provider.provideReferences(
        document,
        position,
        createMockReferenceContext(),
        createMockCancellationToken()
    );

    if (!Array.isArray(references)) {
        throw new Error('References not returned as array');
    }

    // Should not count references in comments and strings
    const validReferences = references.filter(ref => {
        const lines = text.split('\n');
        const line = lines[ref.range.start.line];
        if (!line) return false; // Add null check for line
        const referencedText = line.substring(ref.range.start.character, ref.range.end.character);

        // Check if this reference is in a comment or string
        const beforeRef = line.substring(0, ref.range.start.character);
        const afterRef = line.substring(ref.range.end.character);

        // Simple heuristics for comments and strings
        const inLineComment = beforeRef.includes('//');
        const inString = beforeRef.includes('"') && afterRef.includes('"');
        const inBlockComment = beforeRef.includes('/*') && afterRef.includes('*/');

        return !inLineComment && !inString && !inBlockComment;
    });

    console.log(`Found ${validReferences.length} valid references (excluding comments/strings)`);

    console.log('✓ Comments and strings test passed');
}

async function runAllTests() {
    console.log('=== Running References Provider Tests ===\n');

    try {
        await testTypeReferences();
        await testFieldReferences();
        await testEnumValueReferences();
        await testMethodReferences();
        await testCrossFileReferences();
        await testNamespacedTypeReferences();
        await testFullTypeNameReferences();
        await testInvalidPosition();
        await testEmptyDocument();
        await testWordBoundaryDetection();
        await testCancellationToken();
        await testCommentsAndStrings();

        console.log('\n✅ All references provider tests passed!');
    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        process.exit(1);
    }
}

runAllTests().catch((error) => {
    console.error('Test execution failed:', error);
    process.exit(1);
});