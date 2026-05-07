const Module = require('module');
const originalRequire = Module.prototype.require;

Module.prototype.require = function (path) {
    if (path === 'vscode') {
        return {
            workspace: {
                getConfiguration: () => ({
                    get: (key, def) => def
                })
            },
            Range: class { constructor(s, e) { this.start = s; this.end = e; } },
            Position: class { constructor(l, c) { this.line = l; this.character = c; } },
            TextEdit: {
                replace: (range, text) => ({ range, newText: text })
            },
            window: {
                showErrorMessage: console.error
            },
            DocumentFormattingEditProvider: class { },
            DocumentRangeFormattingEditProvider: class { }
        };
    }
    return originalRequire.apply(this, arguments);
};

const vscode = require('vscode');
const { ThriftFormattingProvider } = require('../out/formattingProvider');

async function testFormatting() {
    const provider = new ThriftFormattingProvider();
    const options = { insertSpaces: true, tabSize: 4 };

    // Test case 1: Const map formatting


    const input = `
const map<string, i32> ERROR_CODES = {
"NOT_FOUND": 404,
"VALIDATION_ERROR": 400,
"INTERNAL_ERROR": 500
}`;

    const expected = `const map<string, i32> ERROR_CODES = {
    "NOT_FOUND": 404,
    "VALIDATION_ERROR": 400,
    "INTERNAL_ERROR": 500
}`;

    // Mock document
    const document = {
        getText: () => input,
        positionAt: (offset) => new vscode.Position(0, 0),
        lineCount: 6
    };

    const edits = provider.provideDocumentFormattingEdits(document, options, null);
    const result = edits[0].newText;

    console.log('Test 1 Result:');
    console.log(result);

    if (result.trim() === expected.trim()) {
        console.log('Test 1 Passed');
    } else {
        console.log('Test 1 Failed');
        console.log('Expected:\n' + expected);
        console.log('Actual:\n' + result);
    }

    // Test case 2: Const with indentation (simulating inside a block or just indented)
    // Note: The current implementation might fail to add indent to the first line
    const input2 = `
    const map<string, i32> INDENTED_CODES = {
    "A": 1
    }`;

    // If we pass initialContext with indentLevel 1, it should be indented
    const document2 = {
        getText: () => input2,
        positionAt: (offset) => new vscode.Position(0, 0),
        lineCount: 4
    };

    // We can't easily mock initialContext via provideDocumentFormattingEdits directly 
    // because it computes it from document.
    // But we can test formatThriftCode directly if we access the private method, 
    // or just rely on the fact that top-level should be 0 indent.

    // Let's test the user's scenario where they claim it's indented wrong.
    // If the input is already indented, the formatter should fix it (remove indent if top level).

    const edits2 = provider.provideDocumentFormattingEdits(document2, options, null);
    const result2 = edits2[0].newText;

    console.log('Test 2 Result:');
    console.log(result2);

    const expected2 = `const map<string, i32> INDENTED_CODES = {
    "A": 1
}`;

    if (result2.trim() === expected2.trim()) {
        console.log('Test 2 Passed');
    } else {
        console.log('Test 2 Failed');
        console.log('Expected:\n' + expected2);
        console.log('Actual:\n' + result2);
    }
}

testFormatting().catch(err => console.error(err));
