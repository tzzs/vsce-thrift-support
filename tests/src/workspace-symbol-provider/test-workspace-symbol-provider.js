const fs = require('fs');
const path = require('path');
const vscode = require('vscode');

const {ThriftWorkspaceSymbolProvider} = require('../../../out/workspace-symbol-provider.js');

const mockFileWatcher = {
    createWatcherWithEvents: () => ({
        dispose: () => {
        }
    })
};

const testFilePath1 = path.join(__dirname, '../../test-files/test.thrift');
const testFilePath2 = path.join(__dirname, '../../test-files/shared.thrift');

const testFiles = [vscode.Uri.file(testFilePath1), vscode.Uri.file(testFilePath2)];

const originalFindFiles = vscode.workspace.findFiles;
const originalFsReadFile = vscode.workspace.fs.readFile;

function setupMocks() {
    vscode.workspace.findFiles = async (pattern) => {
        if (pattern.includes('*.thrift')) {
            return testFiles;
        }
        return [];
    };

    vscode.workspace.fs.readFile = async (uri) => {
        const filePath = uri.fsPath;
        if (filePath.includes('test.thrift')) {
            const content = `namespace java com.example

typedef i32 MyInt

const i32 MAX_VALUE = 100

enum Status {
    ACTIVE = 1,
    INACTIVE = 2
}

struct User {
    1: required i32 id,
    2: optional string name
}

service UserService {
    User getUser(1: i32 userId)
}`;
            return Buffer.from(content, 'utf-8');
        } else if (filePath.includes('shared.thrift')) {
            const content = `namespace java com.example.shared

enum Priority {
    LOW = 1,
    HIGH = 2
}`;
            return Buffer.from(content, 'utf-8');
        }
        return originalFsReadFile(uri);
    };
}

function restoreMocks() {
    vscode.workspace.findFiles = originalFindFiles;
    vscode.workspace.fs.readFile = originalFsReadFile;
}

function createMockCancellationToken() {
    return {isCancellationRequested: false};
}

function findSymbolByName(symbols, name) {
    return symbols.find((symbol) => symbol.name === name);
}

function countSymbolsByType(symbols, typePattern) {
    return symbols.filter((symbol) => symbol.name.includes(typePattern)).length;
}

async function testBasicWorkspaceSymbols() {
    const provider = new ThriftWorkspaceSymbolProvider({fileWatcher: mockFileWatcher});

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
    const hasUserStruct = symbols.some((symbol) => symbol.name === 'User');
    const hasStatusEnum = symbols.some((symbol) => symbol.name === 'Status');
    const hasUserService = symbols.some((symbol) => symbol.name === 'UserService');
    const hasMaxValueConst = symbols.some((symbol) => symbol.name === 'MAX_VALUE');
    const hasMyIntTypedef = symbols.some((symbol) => symbol.name === 'MyInt');

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
}

async function testFilteredWorkspaceSymbols() {
    const provider = new ThriftWorkspaceSymbolProvider({fileWatcher: mockFileWatcher});

    // Test query filtering
    const userSymbols = await provider.provideWorkspaceSymbols(
        'User',
        createMockCancellationToken()
    );

    if (!Array.isArray(userSymbols)) {
        throw new Error('Filtered symbols not returned as array');
    }

    // Should return symbols containing "User"
    const hasUserStruct = userSymbols.some((symbol) => symbol.name === 'User');
    const hasUserService = userSymbols.some((symbol) => symbol.name === 'UserService');

    if (!hasUserStruct) {
        throw new Error('Expected to find User struct in filtered results');
    }

    if (!hasUserService) {
        throw new Error('Expected to find UserService in filtered results');
    }

    // Should not return symbols without "User"
    const hasStatusEnum = userSymbols.some((symbol) => symbol.name === 'Status');
    if (hasStatusEnum) {
        throw new Error('Status enum should not be in User-filtered results');
    }
}

async function testSymbolTypes() {
    const provider = new ThriftWorkspaceSymbolProvider({fileWatcher: mockFileWatcher});

    const symbols = await provider.provideWorkspaceSymbols('', createMockCancellationToken());

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
}

async function testChildSymbols() {
    const provider = new ThriftWorkspaceSymbolProvider({fileWatcher: mockFileWatcher});

    const symbols = await provider.provideWorkspaceSymbols('', createMockCancellationToken());

    // User struct should have field symbols
    const userStruct = findSymbolByName(symbols, 'User');
    if (userStruct) {
        // Check if child symbols are included (they should be in the same file)
        const hasIdField = symbols.some(
            (symbol) => symbol.name === 'id' && symbol.containerName === 'User'
        );
        const hasNameField = symbols.some(
            (symbol) => symbol.name === 'name' && symbol.containerName === 'User'
        );

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
        const hasActiveValue = symbols.some(
            (symbol) => symbol.name === 'ACTIVE' && symbol.containerName === 'Status'
        );
        const hasInactiveValue = symbols.some(
            (symbol) => symbol.name === 'INACTIVE' && symbol.containerName === 'Status'
        );

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
        const hasGetUserMethod = symbols.some(
            (symbol) => symbol.name === 'getUser' && symbol.containerName === 'UserService'
        );

        if (!hasGetUserMethod) {
            throw new Error('Expected to find getUser method symbol');
        }
    }
}

async function testCaseInsensitiveSearch() {
    const provider = new ThriftWorkspaceSymbolProvider({fileWatcher: mockFileWatcher});

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
    const hasUserStructLower = lowerCaseResults.some((symbol) => symbol.name === 'User');
    const hasUserStructUpper = upperCaseResults.some((symbol) => symbol.name === 'User');
    const hasUserStructMixed = mixedCaseResults.some((symbol) => symbol.name === 'User');

    if (!hasUserStructLower) {
        throw new Error('Case-insensitive search failed for lowercase');
    }

    if (!hasUserStructUpper) {
        throw new Error('Case-insensitive search failed for uppercase');
    }

    if (!hasUserStructMixed) {
        throw new Error('Case-insensitive search failed for mixed case');
    }
}

async function testContainerNameFiltering() {
    const provider = new ThriftWorkspaceSymbolProvider({fileWatcher: mockFileWatcher});

    // Search for container names
    const namespaceResults = await provider.provideWorkspaceSymbols(
        'namespace',
        createMockCancellationToken()
    );

    if (!Array.isArray(namespaceResults)) {
        throw new Error('Container search results not returned as array');
    }

    // Should return namespace symbols
    const hasJavaNamespace = namespaceResults.some((symbol) => symbol.name === 'namespace java');
    if (!hasJavaNamespace) {
        throw new Error('Expected to find namespace java in container search');
    }
}

async function testEmptyQuery() {
    const provider = new ThriftWorkspaceSymbolProvider({fileWatcher: mockFileWatcher});

    const allSymbols = await provider.provideWorkspaceSymbols('', createMockCancellationToken());

    const noQuerySymbols = await provider.provideWorkspaceSymbols(
        '',
        createMockCancellationToken()
    );

    // Both should return the same results (all symbols)
    if (allSymbols.length !== noQuerySymbols.length) {
        throw new Error('Empty query should return consistent results');
    }
}

async function testCancellationToken() {
    const provider = new ThriftWorkspaceSymbolProvider({fileWatcher: mockFileWatcher});

    // Create a cancellation token that's already cancelled
    const cancelledToken = {isCancellationRequested: true};

    const symbols = await provider.provideWorkspaceSymbols('', cancelledToken);

    if (!Array.isArray(symbols)) {
        throw new Error('Symbols not returned as array with cancelled token');
    }

    // Should still work but might be empty or partial
}

describe('workspace-symbol-provider', () => {
    before(() => {
        setupMocks();
    });

    after(() => {
        restoreMocks();
    });

    it('should pass testBasicWorkspaceSymbols', async () => {
        await testBasicWorkspaceSymbols();
    });
    it('should pass testFilteredWorkspaceSymbols', async () => {
        await testFilteredWorkspaceSymbols();
    });
    it('should pass testSymbolTypes', async () => {
        await testSymbolTypes();
    });
    it('should pass testChildSymbols', async () => {
        await testChildSymbols();
    });
    it('should pass testCaseInsensitiveSearch', async () => {
        await testCaseInsensitiveSearch();
    });
    it('should pass testContainerNameFiltering', async () => {
        await testContainerNameFiltering();
    });
    it('should pass testEmptyQuery', async () => {
        await testEmptyQuery();
    });
    it('should pass testCancellationToken', async () => {
        await testCancellationToken();
    });
});
