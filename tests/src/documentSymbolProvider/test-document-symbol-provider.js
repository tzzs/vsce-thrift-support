const fs = require('fs');
const path = require('path');

// Enhanced vscode mock for document symbol provider testing
const {createVscodeMock, installVscodeMock} = require('../../mock_vscode.js');
const vscode = createVscodeMock({
    DocumentSymbol: class {
        constructor(name, detail, kind, range, selectionRange) {
            this.name = name;
            this.detail = detail;
            this.kind = kind;
            this.range = range;
            this.selectionRange = selectionRange;
            this.children = [];
        }
    },
    SymbolKind: {
        Struct: 0,
        Class: 1,
        Enum: 2,
        Interface: 3,
        Field: 4,
        EnumMember: 5,
        Method: 6,
        Namespace: 7,
        File: 8,
        TypeParameter: 9,
        Constant: 10,
        Variable: 11
    },
    Range: class {
        constructor(startLine, startChar, endLine, endChar) {
            this.start = {line: startLine, character: startChar};
            this.end = {line: endLine, character: endChar};
        }
    },
    Position: class {
        constructor(line, character) {
            this.line = line;
            this.character = character;
        }
    },
    workspace: {
        createFileSystemWatcher: (globPattern, ignoreCreate, ignoreChange, ignoreDelete) => {
            // Return a mock file system watcher
            return {
                onDidCreate: (callback) => {
                },
                onDidChange: (callback) => {
                },
                onDidDelete: (callback) => {
                },
                dispose: () => {
                }
            };
        }
    }
});
installVscodeMock(vscode);


// Hook require('vscode')
const {ThriftDocumentSymbolProvider} = require('../../../out/documentSymbolProvider.js');

function createMockDocument(text, fileName = 'test.thrift') {
    const lines = text.split('\n');
    // Generate a unique URI for each document to avoid cache conflicts
    const uniqueId = Date.now() + Math.random();
    return {
        uri: {
            fsPath: path.join(__dirname, '..', '..', 'test-files', fileName),
            toString: () => `file://${path.join(__dirname, '..', '..', 'test-files', fileName)}?unique=${uniqueId}`
        },
        getText: () => text,
        lineAt: (line) => ({text: lines[line] || ''})
    };
}

function createMockCancellationToken() {
    return {isCancellationRequested: false};
}

function findSymbolByName(symbols, name) {
    for (const symbol of symbols) {
        if (symbol.name === name) {
            return symbol;
        }
        // Search in children
        if (symbol.children && symbol.children.length > 0) {
            const found = findSymbolByName(symbol.children, name);
            if (found) return found;
        }
    }
    return null;
}

function countSymbols(symbols) {
    let count = symbols.length;
    for (const symbol of symbols) {
        if (symbol.children && symbol.children.length > 0) {
            count += countSymbols(symbol.children);
        }
    }
    return count;
}

async function testBasicStructSymbols() {
    console.log('Testing basic struct symbols...');

    const provider = new ThriftDocumentSymbolProvider();
    const text = `struct User {
  1: required i32 id,
  2: optional string name,
  3: required bool active
}`;
    const document = createMockDocument(text);

    const symbols = await provider.provideDocumentSymbols(
        document,
        createMockCancellationToken()
    );

    if (!Array.isArray(symbols)) {
        throw new Error('Symbols not returned as array');
    }

    if (symbols.length !== 1) {
        throw new Error(`Expected 1 top-level symbol, got ${symbols.length}`);
    }

    const userSymbol = symbols[0];
    console.log('User symbol:', JSON.stringify({
        name: userSymbol.name,
        kind: userSymbol.kind,
        childrenCount: userSymbol.children ? userSymbol.children.length : 0
    }, null, 2));

    if (userSymbol.name !== 'User') {
        throw new Error(`Expected symbol name 'User', got '${userSymbol.name}'`);
    }

    if (userSymbol.kind !== vscode.SymbolKind.Struct) {
        throw new Error(`Expected Struct kind, got ${userSymbol.kind}`);
    }

    if (!userSymbol.children || userSymbol.children.length !== 3) {
        console.log('Children found:', userSymbol.children ? userSymbol.children.map(c => c.name) : 'none');
        throw new Error(`Expected 3 child symbols, got ${userSymbol.children ? userSymbol.children.length : 0}`);
    }

    // Check field symbols
    const idField = findSymbolByName(userSymbol.children, 'id');
    const nameField = findSymbolByName(userSymbol.children, 'name');
    const activeField = findSymbolByName(userSymbol.children, 'active');

    if (!idField || !nameField || !activeField) {
        throw new Error('Expected to find all field symbols');
    }

    if (idField.kind !== vscode.SymbolKind.Field) {
        throw new Error(`Expected Field kind for id, got ${idField.kind}`);
    }

    console.log('✓ Basic struct symbols test passed');
}

async function testEnumSymbols() {
    console.log('Testing enum symbols...');

    const provider = new ThriftDocumentSymbolProvider();
    const text = `enum Status {
  ACTIVE = 1,
  INACTIVE = 2,
  PENDING = 3
}`;
    const document = createMockDocument(text);

    const symbols = await provider.provideDocumentSymbols(
        document,
        createMockCancellationToken()
    );

    if (!Array.isArray(symbols)) {
        throw new Error('Symbols not returned as array');
    }

    if (symbols.length !== 1) {
        throw new Error(`Expected 1 top-level symbol, got ${symbols.length}`);
    }

    const statusSymbol = symbols[0];
    if (statusSymbol.name !== 'Status') {
        throw new Error(`Expected symbol name 'Status', got '${statusSymbol.name}'`);
    }

    if (statusSymbol.kind !== vscode.SymbolKind.Enum) {
        throw new Error(`Expected Enum kind, got ${statusSymbol.kind}`);
    }

    if (!statusSymbol.children || statusSymbol.children.length !== 3) {
        throw new Error(`Expected 3 child symbols, got ${statusSymbol.children ? statusSymbol.children.length : 0}`);
    }

    // Check enum value symbols
    const activeValue = findSymbolByName(statusSymbol.children, 'ACTIVE');
    const inactiveValue = findSymbolByName(statusSymbol.children, 'INACTIVE');
    const pendingValue = findSymbolByName(statusSymbol.children, 'PENDING');

    if (!activeValue || !inactiveValue || !pendingValue) {
        throw new Error('Expected to find all enum value symbols');
    }

    if (activeValue.kind !== vscode.SymbolKind.EnumMember) {
        throw new Error(`Expected EnumMember kind for ACTIVE, got ${activeValue.kind}`);
    }

    console.log('✓ Enum symbols test passed');
}

async function testServiceSymbols() {
    console.log('Testing service symbols...');

    const provider = new ThriftDocumentSymbolProvider();
    const text = `service UserService {
  User getUser(1: i32 userId),
  void createUser(1: User user),
  oneway void deleteUser(1: i32 userId)
}`;
    const document = createMockDocument(text);

    const symbols = await provider.provideDocumentSymbols(
        document,
        createMockCancellationToken()
    );

    if (!Array.isArray(symbols)) {
        throw new Error('Symbols not returned as array');
    }

    if (symbols.length !== 1) {
        throw new Error(`Expected 1 top-level symbol, got ${symbols.length}`);
    }

    const serviceSymbol = symbols[0];
    if (serviceSymbol.name !== 'UserService') {
        throw new Error(`Expected symbol name 'UserService', got '${serviceSymbol.name}'`);
    }

    if (serviceSymbol.kind !== vscode.SymbolKind.Interface) {
        throw new Error(`Expected Interface kind, got ${serviceSymbol.kind}`);
    }

    if (!serviceSymbol.children || serviceSymbol.children.length !== 3) {
        throw new Error(`Expected 3 child symbols, got ${serviceSymbol.children ? serviceSymbol.children.length : 0}`);
    }

    // Check method symbols
    const getUserMethod = findSymbolByName(serviceSymbol.children, 'getUser');
    const createUserMethod = findSymbolByName(serviceSymbol.children, 'createUser');
    const deleteUserMethod = findSymbolByName(serviceSymbol.children, 'deleteUser');

    if (!getUserMethod || !createUserMethod || !deleteUserMethod) {
        throw new Error('Expected to find all method symbols');
    }

    if (getUserMethod.kind !== vscode.SymbolKind.Method) {
        throw new Error(`Expected Method kind for getUser, got ${getUserMethod.kind}`);
    }

    console.log('✓ Service symbols test passed');
}

async function testNamespaceSymbols() {
    console.log('Testing namespace symbols...');

    const provider = new ThriftDocumentSymbolProvider();
    const text = `namespace java com.example.thrift
namespace cpp example.thrift`;
    const document = createMockDocument(text);

    const symbols = await provider.provideDocumentSymbols(
        document,
        createMockCancellationToken()
    );

    if (!Array.isArray(symbols)) {
        throw new Error('Symbols not returned as array');
    }

    if (symbols.length !== 2) {
        throw new Error(`Expected 2 namespace symbols, got ${symbols.length}`);
    }

    const javaNamespace = symbols[0];
    const cppNamespace = symbols[1];

    if (javaNamespace.name !== 'namespace java') {
        throw new Error(`Expected 'namespace java', got '${javaNamespace.name}'`);
    }

    if (javaNamespace.kind !== vscode.SymbolKind.Namespace) {
        throw new Error(`Expected Namespace kind, got ${javaNamespace.kind}`);
    }

    if (cppNamespace.name !== 'namespace cpp') {
        throw new Error(`Expected 'namespace cpp', got '${cppNamespace.name}'`);
    }

    console.log('✓ Namespace symbols test passed');
}

async function testIncludeSymbols() {
    console.log('Testing include symbols...');

    const provider = new ThriftDocumentSymbolProvider();
    const text = `include "shared.thrift"
include "common/types.thrift"`;
    const document = createMockDocument(text);

    const symbols = await provider.provideDocumentSymbols(
        document,
        createMockCancellationToken()
    );

    if (!Array.isArray(symbols)) {
        throw new Error('Symbols not returned as array');
    }

    if (symbols.length !== 2) {
        throw new Error(`Expected 2 include symbols, got ${symbols.length}`);
    }

    const firstInclude = symbols[0];
    const secondInclude = symbols[1];

    if (firstInclude.name !== 'include shared.thrift') {
        throw new Error(`Expected 'include shared.thrift', got '${firstInclude.name}'`);
    }

    if (firstInclude.kind !== vscode.SymbolKind.File) {
        throw new Error(`Expected File kind, got ${firstInclude.kind}`);
    }

    console.log('✓ Include symbols test passed');
}

async function testComplexDocument() {
    console.log('Testing complex document with multiple types...');

    const provider = new ThriftDocumentSymbolProvider();
    const text = `namespace java com.example.thrift
include "shared.thrift"

enum Status {
  ACTIVE = 1,
  INACTIVE = 2
}

struct User {
  1: required i32 id,
  2: optional string name,
  3: required Status status
}

service UserService {
  User getUser(1: i32 userId),
  void createUser(1: User user)
}

const i32 MAX_USERS = 1000`;
    const document = createMockDocument(text);

    const symbols = await provider.provideDocumentSymbols(
        document,
        createMockCancellationToken()
    );

    if (!Array.isArray(symbols)) {
        throw new Error('Symbols not returned as array');
    }

    // Expected symbols: namespace, include, enum, struct, service, const
    if (symbols.length !== 6) {
        throw new Error(`Expected 6 top-level symbols, got ${symbols.length}`);
    }

    // Check specific symbols
    const namespaceSymbol = symbols.find(s => s.name.includes('namespace'));
    const includeSymbol = symbols.find(s => s.name.includes('include'));
    const statusEnum = symbols.find(s => s.name === 'Status');
    const userStruct = symbols.find(s => s.name === 'User');
    const userService = symbols.find(s => s.name === 'UserService');
    const maxUsersConst = symbols.find(s => s.name === 'MAX_USERS');

    if (!namespaceSymbol) throw new Error('Missing namespace symbol');
    if (!includeSymbol) throw new Error('Missing include symbol');
    if (!statusEnum) throw new Error('Missing Status enum symbol');
    if (!userStruct) throw new Error('Missing User struct symbol');
    if (!userService) throw new Error('Missing UserService symbol');
    if (!maxUsersConst) throw new Error('Missing MAX_USERS const symbol');

    // Check enum has children
    if (!statusEnum.children || statusEnum.children.length !== 2) {
        throw new Error('Expected Status enum to have 2 children');
    }

    // Check struct has children
    if (!userStruct.children || userStruct.children.length !== 3) {
        throw new Error('Expected User struct to have 3 children');
    }

    // Check service has children
    if (!userService.children || userService.children.length !== 2) {
        throw new Error('Expected UserService to have 2 children');
    }

    // Check const symbol kind
    if (maxUsersConst.kind !== vscode.SymbolKind.Constant) {
        throw new Error(`Expected Constant kind for MAX_USERS, got ${maxUsersConst.kind}`);
    }

    console.log('✓ Complex document symbols test passed');
}

async function testEmptyDocument() {
    console.log('Testing empty document...');

    const provider = new ThriftDocumentSymbolProvider();
    const text = ``;
    const document = createMockDocument(text);

    const symbols = await provider.provideDocumentSymbols(
        document,
        createMockCancellationToken()
    );

    if (!Array.isArray(symbols)) {
        throw new Error('Symbols not returned as array');
    }

    if (symbols.length !== 0) {
        throw new Error(`Expected 0 symbols for empty document, got ${symbols.length}`);
    }

    console.log('✓ Empty document symbols test passed');
}

async function testCommentsAndWhitespace() {
    console.log('Testing document with comments and whitespace...');

    const provider = new ThriftDocumentSymbolProvider();
    const text = `// This is a comment
/* Multi-line
   comment */
# Hash comment

struct User {
  // Field comment
  1: required i32 id,
  /* Another field comment */
  2: optional string name
}`;
    const document = createMockDocument(text);

    const symbols = await provider.provideDocumentSymbols(
        document,
        createMockCancellationToken()
    );

    if (!Array.isArray(symbols)) {
        throw new Error('Symbols not returned as array');
    }

    if (symbols.length !== 1) {
        throw new Error(`Expected 1 symbol (ignoring comments), got ${symbols.length}`);
    }

    const userSymbol = symbols[0];
    if (userSymbol.name !== 'User') {
        throw new Error(`Expected 'User' symbol, got '${userSymbol.name}'`);
    }

    if (!userSymbol.children || userSymbol.children.length !== 2) {
        throw new Error(`Expected 2 field symbols, got ${userSymbol.children ? userSymbol.children.length : 0}`);
    }

    console.log('✓ Comments and whitespace test passed');
}

async function runAllTests() {
    console.log('=== Running Document Symbol Provider Tests ===\n');

    try {
        await testBasicStructSymbols();
        await testEnumSymbols();
        await testServiceSymbols();
        await testNamespaceSymbols();
        await testIncludeSymbols();
        await testComplexDocument();
        await testEmptyDocument();
        await testCommentsAndWhitespace();

        console.log('\n✅ All document symbol provider tests passed!');
    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        process.exit(1);
    }
}

runAllTests().catch((error) => {
    console.error('Test execution failed:', error);
    process.exit(1);
});