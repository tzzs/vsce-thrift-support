const fs = require('fs');
const path = require('path');

// Enhanced vscode mock for workspace symbol provider testing
const vscode = {
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
                    {fsPath: path.join(__dirname, 'tests', 'test-files', 'file1.thrift')},
                    {fsPath: path.join(__dirname, 'tests', 'test-files', 'file2.thrift')},
                    {fsPath: path.join(__dirname, 'tests', 'test-files', 'subdir', 'file3.thrift')}
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
};

// Hook require('vscode')
const Module = require('module');
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
    if (request === 'vscode') return vscode;
    return originalLoad.apply(this, arguments);
};

const {ThriftWorkspaceSymbolProvider} = require('./out/src/workspaceSymbolProvider.js');

async function debug() {
    const provider = new ThriftWorkspaceSymbolProvider();

    console.log('=== Testing User Query ===');
    const userSymbols = await provider.provideWorkspaceSymbols('User', {isCancellationRequested: false});

    console.log('User query returned', userSymbols.length, 'symbols:');
    userSymbols.forEach(symbol => {
        console.log(`  - Name: "${symbol.name}", Container: "${symbol.containerName}", Kind: ${symbol.kind}`);
    });

    console.log('\n=== Testing All Symbols ===');
    const allSymbols = await provider.provideWorkspaceSymbols('', {isCancellationRequested: false});

    console.log('All symbols returned', allSymbols.length, 'symbols:');
    allSymbols.forEach(symbol => {
        console.log(`  - Name: "${symbol.name}", Container: "${symbol.containerName}", Kind: ${symbol.kind}`);
    });

    console.log('\n=== Testing Status Query ===');
    const statusSymbols = await provider.provideWorkspaceSymbols('Status', {isCancellationRequested: false});

    console.log('Status query returned', statusSymbols.length, 'symbols:');
    statusSymbols.forEach(symbol => {
        console.log(`  - Name: "${symbol.name}", Container: "${symbol.containerName}", Kind: ${symbol.kind}`);
    });
}

debug().catch(console.error);