const fs = require('fs');
const path = require('path');

// Enhanced vscode mock for workspace symbol provider testing
const {createVscodeMock, installVscodeMock} = require('../../test-helpers/vscode-mock');
const vscode = createVscodeMock({
    SymbolInformation: class {
        constructor(name, kind, containerName, location) {
            this.name = name;
            this.kind = kind;
            this.containerName = containerName || '';
            this.location = location;
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
    Location: class {
        constructor(uri, range) {
            this.uri = uri;
            this.range = range;
        }
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
        findFiles: async (pattern, exclude) => {
            // Mock implementation - return test thrift files
            if (pattern === '**/*.thrift') {
                return [
                    {fsPath: path.join(__dirname, '..', '..', 'test-files', 'file1.thrift')},
                    {fsPath: path.join(__dirname, '..', '..', 'test-files', 'file2.thrift')},
                    {fsPath: path.join(__dirname, '..', '..', 'test-files', 'subdir', 'file3.thrift')}
                ];
            }
            return [];
        },
        openTextDocument: async (uri) => {
            // Mock different file contents based on path
            const fileName = path.basename(uri.fsPath);
            let content = '';

            if (fileName === 'file1.thrift') {
                content = `namespace java com.example
struct User {
  1: required i32 id,
  2: optional string name
}`;
            } else if (fileName === 'file2.thrift') {
                content = `enum Status {
  ACTIVE = 1,
  INACTIVE = 2
}
service UserService {
  User getUser(1: i32 id)
}`;
            } else if (fileName === 'file3.thrift') {
                content = `const i32 MAX_VALUE = 1000
typedef i32 MyInt`;
            }

            return {
                getText: () => content,
                uri: uri
            };
        },
        fs: {
            readFile: async (uri) => {
                // Mock file system read operation
                const fileName = path.basename(uri.fsPath);
                let content = '';

                if (fileName === 'file1.thrift') {
                    content = `namespace java com.example
struct User {
  1: required i32 id,
  2: optional string name
}`;
                } else if (fileName === 'file2.thrift') {
                    content = `enum Status {
  ACTIVE = 1,
  INACTIVE = 2
}
service UserService {
  User getUser(1: i32 id)
}`;
                } else if (fileName === 'file3.thrift') {
                    content = `const i32 MAX_VALUE = 1000
typedef i32 MyInt`;
                }

                // Return as Uint8Array like the real VS Code API
                return new TextEncoder().encode(content);
            }
        },
        createFileSystemWatcher: () => new vscode.FileSystemWatcher(),
        textDocuments: [] // Add missing textDocuments property
    },
    Uri: {
        file: (filePath) => ({fsPath: filePath})
    },
    FileSystemWatcher: class {
        constructor() {
            // Create proper event functions that match VS Code API
            this._createListeners = [];
            this._changeListeners = [];
            this._deleteListeners = [];

            this.onDidCreate = (listener, thisArg, disposables) => {
                this._createListeners.push(listener);
                return {
                    dispose: () => {
                        const index = this._createListeners.indexOf(listener);
                        if (index > -1) this._createListeners.splice(index, 1);
                    }
                };
            };

            this.onDidChange = (listener, thisArg, disposables) => {
                this._changeListeners.push(listener);
                return {
                    dispose: () => {
                        const index = this._changeListeners.indexOf(listener);
                        if (index > -1) this._changeListeners.splice(index, 1);
                    }
                };
            };

            this.onDidDelete = (listener, thisArg, disposables) => {
                this._deleteListeners.push(listener);
                return {
                    dispose: () => {
                        const index = this._deleteListeners.indexOf(listener);
                        if (index > -1) this._deleteListeners.splice(index, 1);
                    }
                };
            };
        }

        dispose() {
        }
    }
});
installVscodeMock(vscode);


// Hook require('vscode')
const {ThriftWorkspaceSymbolProvider} = require('../../../out/src/workspaceSymbolProvider.js');

function createMockCancellationToken() {
    return {isCancellationRequested: false};
}

function findSymbolByName(symbols, name) {
    return symbols.find(symbol => symbol.name === name);
}

function countSymbolsByType(symbols, typePattern) {
    return symbols.filter(symbol => symbol.name.includes(typePattern)).length;
}

async function testBasicWorkspaceSymbols() {
    console.log('Testing basic workspace symbols...');

    const provider = new ThriftWorkspaceSymbolProvider();

    const symbols = await provider.provideWorkspaceSymbols(
        '', // Empty query - return all symbols
        createMockCancellationToken()
    );

    if (!Array.isArray(symbols)) {
        throw new Error('Symbols not returned as array');
    }

    if (symbols.length === 0) {
        throw new Error('Expected workspace symbols, got empty array');
    }

    // Check for expected symbols from our mock files
    const hasUserStruct = symbols.some(symbol => symbol.name === 'User');
    const hasStatusEnum = symbols.some(symbol => symbol.name === 'Status');
    const hasUserService = symbols.some(symbol => symbol.name === 'UserService');
    const hasMaxValueConst = symbols.some(symbol => symbol.name === 'MAX_VALUE');
    const hasMyIntTypedef = symbols.some(symbol => symbol.name === 'MyInt');


    if (!hasUserStruct) {
        throw new Error('Expected to find User struct symbol');
    }

    if (!hasStatusEnum) {
        throw new Error('Expected to find Status enum symbol');
    }

    if (!hasUserService) {
        throw new Error('Expected to find UserService service symbol');
    }

    if (!hasMaxValueConst) {
        throw new Error('Expected to find MAX_VALUE const symbol');
    }

    if (!hasMyIntTypedef) {
        throw new Error('Expected to find MyInt typedef symbol');
    }

    console.log('✓ Basic workspace symbols test passed');
}

async function testFilteredWorkspaceSymbols() {
    console.log('Testing filtered workspace symbols...');

    const provider = new ThriftWorkspaceSymbolProvider();

    // Test query filtering
    const userSymbols = await provider.provideWorkspaceSymbols(
        'User',
        createMockCancellationToken()
    );

    if (!Array.isArray(userSymbols)) {
        throw new Error('Filtered symbols not returned as array');
    }

    // Should return symbols containing "User"
    const hasUserStruct = userSymbols.some(symbol => symbol.name === 'User');
    const hasUserService = userSymbols.some(symbol => symbol.name === 'UserService');

    if (!hasUserStruct) {
        throw new Error('Expected to find User struct in filtered results');
    }

    if (!hasUserService) {
        throw new Error('Expected to find UserService in filtered results');
    }

    // Should not return symbols without "User"
    const hasStatusEnum = userSymbols.some(symbol => symbol.name === 'Status');
    if (hasStatusEnum) {
        throw new Error('Status enum should not be in User-filtered results');
    }

    console.log('✓ Filtered workspace symbols test passed');
}

async function testSymbolTypes() {
    console.log('Testing symbol types...');

    const provider = new ThriftWorkspaceSymbolProvider();

    const symbols = await provider.provideWorkspaceSymbols(
        '',
        createMockCancellationToken()
    );

    // Find specific symbols and check their types
    const userStruct = findSymbolByName(symbols, 'User');
    const statusEnum = findSymbolByName(symbols, 'Status');
    const userService = findSymbolByName(symbols, 'UserService');
    const maxValueConst = findSymbolByName(symbols, 'MAX_VALUE');
    const myIntTypedef = findSymbolByName(symbols, 'MyInt');

    if (userStruct && userStruct.kind !== vscode.SymbolKind.Struct) {
        throw new Error(`Expected Struct kind for User, got ${userStruct.kind}`);
    }

    if (statusEnum && statusEnum.kind !== vscode.SymbolKind.Enum) {
        throw new Error(`Expected Enum kind for Status, got ${statusEnum.kind}`);
    }

    if (userService && userService.kind !== vscode.SymbolKind.Interface) {
        throw new Error(`Expected Interface kind for UserService, got ${userService.kind}`);
    }

    if (maxValueConst && maxValueConst.kind !== vscode.SymbolKind.Constant) {
        throw new Error(`Expected Constant kind for MAX_VALUE, got ${maxValueConst.kind}`);
    }

    if (myIntTypedef && myIntTypedef.kind !== vscode.SymbolKind.TypeParameter) {
        throw new Error(`Expected TypeParameter kind for MyInt, got ${myIntTypedef.kind}`);
    }

    console.log('✓ Symbol types test passed');
}

async function testChildSymbols() {
    console.log('Testing child symbols (fields, methods, etc.)...');

    const provider = new ThriftWorkspaceSymbolProvider();

    const symbols = await provider.provideWorkspaceSymbols(
        '',
        createMockCancellationToken()
    );

    // User struct should have field symbols
    const userStruct = findSymbolByName(symbols, 'User');
    if (userStruct) {
        // Check if child symbols are included (they should be in the same file)
        const hasIdField = symbols.some(symbol => symbol.name === 'id' && symbol.containerName === 'User');
        const hasNameField = symbols.some(symbol => symbol.name === 'name' && symbol.containerName === 'User');

        if (!hasIdField) {
            throw new Error('Expected to find id field symbol');
        }

        if (!hasNameField) {
            throw new Error('Expected to find name field symbol');
        }
    }

    // Status enum should have value symbols
    const statusEnum = findSymbolByName(symbols, 'Status');
    if (statusEnum) {
        const hasActiveValue = symbols.some(symbol => symbol.name === 'ACTIVE' && symbol.containerName === 'Status');
        const hasInactiveValue = symbols.some(symbol => symbol.name === 'INACTIVE' && symbol.containerName === 'Status');


        if (!hasActiveValue) {
            throw new Error('Expected to find ACTIVE enum value symbol');
        }

        if (!hasInactiveValue) {
            throw new Error('Expected to find INACTIVE enum value symbol');
        }
    }

    // UserService should have method symbols
    const userService = findSymbolByName(symbols, 'UserService');
    if (userService) {
        const hasGetUserMethod = symbols.some(symbol => symbol.name === 'getUser' && symbol.containerName === 'UserService');

        if (!hasGetUserMethod) {
            throw new Error('Expected to find getUser method symbol');
        }
    }

    console.log('✓ Child symbols test passed');
}

async function testCaseInsensitiveSearch() {
    console.log('Testing case-insensitive search...');

    const provider = new ThriftWorkspaceSymbolProvider();

    // Search with different cases
    const lowerCaseResults = await provider.provideWorkspaceSymbols(
        'user',
        createMockCancellationToken()
    );

    const upperCaseResults = await provider.provideWorkspaceSymbols(
        'USER',
        createMockCancellationToken()
    );

    const mixedCaseResults = await provider.provideWorkspaceSymbols(
        'User',
        createMockCancellationToken()
    );

    // All searches should return the same results
    const hasUserStructLower = lowerCaseResults.some(symbol => symbol.name === 'User');
    const hasUserStructUpper = upperCaseResults.some(symbol => symbol.name === 'User');
    const hasUserStructMixed = mixedCaseResults.some(symbol => symbol.name === 'User');

    if (!hasUserStructLower) {
        throw new Error('Case-insensitive search failed for lowercase');
    }

    if (!hasUserStructUpper) {
        throw new Error('Case-insensitive search failed for uppercase');
    }

    if (!hasUserStructMixed) {
        throw new Error('Case-insensitive search failed for mixed case');
    }

    console.log('✓ Case-insensitive search test passed');
}

async function testContainerNameFiltering() {
    console.log('Testing container name filtering...');

    const provider = new ThriftWorkspaceSymbolProvider();

    // Search for container names
    const namespaceResults = await provider.provideWorkspaceSymbols(
        'namespace',
        createMockCancellationToken()
    );

    if (!Array.isArray(namespaceResults)) {
        throw new Error('Container search results not returned as array');
    }

    // Should return namespace symbols
    const hasJavaNamespace = namespaceResults.some(symbol => symbol.name === 'namespace java');
    if (!hasJavaNamespace) {
        throw new Error('Expected to find namespace java in container search');
    }

    console.log('✓ Container name filtering test passed');
}

async function testEmptyQuery() {
    console.log('Testing empty query...');

    const provider = new ThriftWorkspaceSymbolProvider();

    const allSymbols = await provider.provideWorkspaceSymbols(
        '',
        createMockCancellationToken()
    );

    const noQuerySymbols = await provider.provideWorkspaceSymbols(
        '',
        createMockCancellationToken()
    );

    // Both should return the same results (all symbols)
    if (allSymbols.length !== noQuerySymbols.length) {
        throw new Error('Empty query should return consistent results');
    }

    console.log('✓ Empty query test passed');
}

async function testCancellationToken() {
    console.log('Testing cancellation token...');

    const provider = new ThriftWorkspaceSymbolProvider();

    // Create a cancellation token that's already cancelled
    const cancelledToken = {isCancellationRequested: true};

    const symbols = await provider.provideWorkspaceSymbols(
        '',
        cancelledToken
    );

    if (!Array.isArray(symbols)) {
        throw new Error('Symbols not returned as array with cancelled token');
    }

    // Should still work but might be empty or partial
    console.log('✓ Cancellation token test passed');
}

async function runAllTests() {
    console.log('=== Running Workspace Symbol Provider Tests ===\n');

    try {
        await testBasicWorkspaceSymbols();
        await testFilteredWorkspaceSymbols();
        await testSymbolTypes();
        await testChildSymbols();
        await testCaseInsensitiveSearch();
        await testContainerNameFiltering();
        await testEmptyQuery();
        await testCancellationToken();

        console.log('\n✅ All workspace symbol provider tests passed!');
    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        process.exit(1);
    }
}

runAllTests().catch((error) => {
    console.error('Test execution failed:', error);
    process.exit(1);
});