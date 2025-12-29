const Module = require('module');

// Mock VSCode API
const {createVscodeMock, installVscodeMock} = require('../../mock_vscode.js');
const vscode = createVscodeMock({
    TextDocument: class {
        constructor(uri, text) {
            this.uri = uri;
            this._text = text;
        }

        getText(range) {
            if (!range) return this._text;
            return this._text;
        }

        positionAt(offset) {
            return {line: 0, character: offset};
        }

        offsetAt(position) {
            return 0;
        }
    },

    Range: class {
        constructor(start, end) {
            this.start = start;
            this.end = end;
        }
    },

    TextEdit: {
        replace: (range, newText) => ({range, newText})
    },

    workspace: {
        getConfiguration: () => ({
            get: (key, defaultValue) => {
                const configs = {
                    'trailingComma': 'preserve',
                    'alignTypes': true,
                    'alignFieldNames': false,
                    'alignComments': true,
                    'indentSize': 4,
                    'maxLineLength': 100
                };
                return configs[key] !== undefined ? configs[key] : defaultValue;
            }
        })
    }
});
installVscodeMock(vscode);


// Mock require for vscode module
const originalRequire = Module.prototype.require;
Module.prototype.require = function (id) {
    if (id === 'vscode') {
        return vscode;
    }
    return originalRequire.apply(this, arguments);
};

// Test complex types formatting
function testComplexTypesFormatting() {
    console.log('Testing complex types formatting...');

    try {
        const {ThriftFormattingProvider} = require('../../../out/formatting-provider.js');
        const formatter = new ThriftFormattingProvider();

        const testCode = `struct TestStruct {
    1: required list < string > names,
    2: optional map< string , i32 > values  ,
    3: i32 count
}`;

        console.log('Input code:');
        console.log(testCode);

        const document = new vscode.TextDocument(
            {fsPath: '/test/format.thrift'},
            testCode
        );

        const options = {insertSpaces: true, tabSize: 4};
        const edits = formatter.provideDocumentFormattingEdits(document, options);

        if (edits && edits.length > 0) {
            const formattedText = edits[0].newText;
            console.log('\nFormatted code:');
            console.log(formattedText);

            // Check specific formatting expectations
            const hasCorrectList = formattedText.includes('list<string>');
            const hasCorrectMap = formattedText.includes('map<string,i32>');

            console.log('\nChecking formatting:');
            console.log('- list<string> (no spaces):', hasCorrectList ? '✓' : '✗');
            console.log('- map<string,i32> (no spaces):', hasCorrectMap ? '✓' : '✗');

            if (hasCorrectList && hasCorrectMap) {
                console.log('\n✓ Complex types formatted correctly');
            } else {
                console.log('\n✗ Complex types not formatted correctly');
                console.log('Expected: list<string> and map<string,i32>');
            }
        } else {
            console.log('✗ Formatting failed - no edits returned');
        }
    } catch (error) {
        console.log('✗ Complex types formatting test failed:', error.message);
        console.log(error.stack);
    }
}

testComplexTypesFormatting();
