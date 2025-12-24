const fs = require('fs');
const path = require('path');

// Use the mock vscode module
const {Position, Range, Uri, workspace, SymbolKind, DocumentSymbol} = require('./mock-vscode');

// Hook require('vscode')
const Module = require('module');
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
    if (request === 'vscode') return {Position, Range, Uri, workspace, SymbolKind, DocumentSymbol};
    return originalLoad.apply(this, arguments);
};

const {ThriftDocumentSymbolProvider} = require('../out/documentSymbolProvider.js');

function createMockDocument(text, fileName = 'test.thrift') {
    const lines = text.split('\n');
    // Generate a unique URI for each document to avoid cache conflicts
    const uniqueId = Date.now() + Math.random();
    return {
        uri: {
            fsPath: path.join(__dirname, 'test-files', fileName),
            toString: () => `file://${path.join(__dirname, 'test-files', fileName)}?unique=${uniqueId}`
        },
        getText: () => text,
        lineAt: (line) => ({text: lines[line] || ''})
    };
}

function createMockCancellationToken() {
    return {isCancellationRequested: false};
}

async function debugNamespace() {
    console.log('=== Debugging Namespace Processing ===');

    const provider = new ThriftDocumentSymbolProvider();
    const text = `namespace java com.example.thrift
namespace cpp example.thrift`;
    const document = createMockDocument(text);

    console.log('Input text:');
    console.log(text);

    const symbols = await provider.provideDocumentSymbols(
        document,
        createMockCancellationToken()
    );

    console.log('\nGenerated symbols:');
    console.log(JSON.stringify(symbols, null, 2));
}

debugNamespace().catch(console.error);