const path = require('path');
const vscode = require('vscode');

const {ThriftDocumentSymbolProvider} = require('../../../out/document-symbol-provider.js');
const {ThriftFoldingRangeProvider} = require('../../../out/folding-range-provider.js');
const {ThriftSelectionRangeProvider} = require('../../../out/selection-range-provider.js');
const {ThriftRenameProvider} = require('../../../out/rename-provider.js');
const {ThriftFormattingProvider} = require('../../../out/formatting-bridge/index.js');
const {ThriftRefactorCodeActionProvider} = require('../../../out/code-actions-provider.js');
const {ThriftFormatter} = require('../../../out/formatter/index.js');
const {ThriftParser} = require('../../../out/ast/parser.js');

function createThrowingDocument({text = 'struct A { 1: i32 id }', throwOn = 'getText'} = {}) {
    const lines = text.split('\n');
    const filePath = path.join(__dirname, '..', '..', 'test-files', 'error-handler.thrift');
    return {
        languageId: 'thrift',
        uri: {
            fsPath: filePath,
            toString: () => `file://${filePath}?error=1`
        },
        getText: () => {
            if (throwOn === 'getText') {
                throw new Error('getText failed');
            }
            return text;
        },
        lineAt: (line) => {
            if (throwOn === 'lineAt') {
                throw new Error('lineAt failed');
            }
            return {text: lines[line] || ''};
        },
        positionAt: (offset) => new vscode.Position(0, offset),
        getWordRangeAtPosition: () => new vscode.Range(0, 0, 0, 1)
    };
}

async function testDocumentSymbolProviderHandlesErrors() {
    const provider = new ThriftDocumentSymbolProvider();
    const document = createThrowingDocument({throwOn: 'getText'});
    const result = await provider.provideDocumentSymbols(document, {isCancellationRequested: false});
    if (!Array.isArray(result) || result.length !== 0) {
        throw new Error('DocumentSymbolProvider should return [] on error');
    }
}

async function testFoldingRangeProviderHandlesErrors() {
    const provider = new ThriftFoldingRangeProvider();
    const document = createThrowingDocument({throwOn: 'getText'});
    const result = await provider.provideFoldingRanges(document, {}, {isCancellationRequested: false});
    if (!Array.isArray(result) || result.length !== 0) {
        throw new Error('FoldingRangeProvider should return [] on error');
    }
}

async function testSelectionRangeProviderHandlesErrors() {
    const provider = new ThriftSelectionRangeProvider();
    const document = createThrowingDocument({throwOn: 'getText'});
    const result = await provider.provideSelectionRanges(
        document,
        [new vscode.Position(0, 0)],
        {isCancellationRequested: false}
    );
    if (!Array.isArray(result) || result.length !== 0) {
        throw new Error('SelectionRangeProvider should return [] on error');
    }
}

async function testRenameProviderHandlesErrors() {
    const provider = new ThriftRenameProvider();
    const document = createThrowingDocument({throwOn: 'lineAt'});
    const result = await provider.provideRenameEdits(
        document,
        new vscode.Position(0, 0),
        'NewName',
        {isCancellationRequested: false}
    );
    if (typeof result !== 'undefined') {
        throw new Error('RenameProvider should return undefined on error');
    }
}

async function testFormattingProviderHandlesErrors() {
    const provider = new ThriftFormattingProvider();
    const document = createThrowingDocument({throwOn: 'getText'});
    const result = provider.provideDocumentFormattingEdits(
        document,
        {indentSize: 4, insertSpaces: true, tabSize: 4},
        {isCancellationRequested: false}
    );
    if (!Array.isArray(result) || result.length !== 0) {
        throw new Error('FormattingProvider should return [] on error');
    }
}

async function testCodeActionsProviderHandlesErrors() {
    const provider = new ThriftRefactorCodeActionProvider();
    const document = createThrowingDocument({throwOn: 'lineAt'});
    const range = new vscode.Range(0, 0, 0, 1);
    const result = await provider.provideCodeActions(
        document,
        range,
        {diagnostics: []},
        {isCancellationRequested: false}
    );
    if (!Array.isArray(result) || result.length !== 0) {
        throw new Error('CodeActionProvider should return [] on error');
    }
}

async function testFormatterHandlesErrors() {
    const formatter = new ThriftFormatter();
    const originalParse = ThriftParser.prototype.parse;
    ThriftParser.prototype.parse = function () {
        throw new Error('parse failed');
    };

    const input = 'struct A { 1: i32 id }';
    const output = formatter.format(input, {
        trailingComma: 'preserve',
        alignTypes: true,
        alignFieldNames: true,
        alignStructDefaults: false,
        alignAnnotations: true,
        alignComments: true,
        alignEnumNames: true,
        alignEnumEquals: true,
        alignEnumValues: true,
        indentSize: 4,
        maxLineLength: 100,
        collectionStyle: 'preserve',
        insertSpaces: true,
        tabSize: 4
    });

    ThriftParser.prototype.parse = originalParse;

    if (output !== input) {
        throw new Error('Formatter should return original content on error');
    }
}

async function run() {

    await testDocumentSymbolProviderHandlesErrors();
    await testFoldingRangeProviderHandlesErrors();
    await testSelectionRangeProviderHandlesErrors();
    await testRenameProviderHandlesErrors();
    await testFormattingProviderHandlesErrors();
    await testCodeActionsProviderHandlesErrors();
    await testFormatterHandlesErrors();

}

describe('error-handler-integration', () => {
    it('should pass all test assertions', async () => {
        await run();
    });
});
