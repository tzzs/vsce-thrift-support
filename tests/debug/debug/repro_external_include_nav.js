const assert = require('assert');
const path = require('path');
const fs = require('fs');

// Mock VS Code API
const {createVscodeMock, installVscodeMock} = require('../test-helpers/vscode-mock');
const vscode = createVscodeMock({
    window: {
        showInformationMessage: () => {
        },
        showErrorMessage: () => {
        },
        activeTextEditor: null
    },
    Position: class {
        constructor(currLine, currChar) {
            this.line = currLine;
            this.character = currChar;
        }
    },
    Range: class {
        constructor(start, end) {
            this.start = start;
            this.end = end;
        }

        contains(pos) {
            return true;
        }
    },
    Location: class {
        constructor(uri, range) {
            this.uri = uri;
            this.range = range;
        }
    },
    Uri: {
        file: (f) => ({fsPath: f, toString: () => f}),
        parse: (s) => ({fsPath: s, toString: () => s})
    },
    workspace: {
        fs: {
            readFile: async (uri) => {
                return Buffer.from(fs.readFileSync(uri.fsPath, 'utf8'));
            },
            stat: async (uri) => {
                try {
                    fs.statSync(uri.fsPath);
                    return {};
                } catch (e) {
                    throw e;
                }
            }
        },
        textDocuments: [],
        getWorkspaceFolder: () => ({uri: {fsPath: __dirname}}),
        asRelativePath: (p) => path.relative(__dirname, p)
    },
    TextDocument: class {
        constructor(uri, content) {
            this.uri = uri;
            this.content = content;
            this.lines = content.split('\n');
        }

        getText(range) {
            return this.content;
        }

        lineAt(line) {
            return {text: this.lines[line]};
        }

        getWordRangeAtPosition(pos) {
            const line = this.lines[pos.line];
            if (!line) return undefined;

            // VS Code's getWordRangeAtPosition returns the word identifier under the cursor,
            // NOT including dots. So "shared.SharedStruct" returns "shared" or "SharedStruct"
            let start = pos.character;
            let end = pos.character;

            // Move start backwards to find beginning of identifier
            while (start > 0 && /[a-zA-Z0-9_]/.test(line[start - 1])) {
                start--;
            }

            // Move end forwards to find end of identifier
            while (end < line.length && /[a-zA-Z0-9_]/.test(line[end])) {
                end++;
            }

            if (start === end) return undefined;

            return new vscode.Range(new vscode.Position(pos.line, start), new vscode.Position(pos.line, end));
        }

        positionAt(offset) {
            return new vscode.Position(0, 0);
        }
    },
    CancellationToken: class {
    }
});
installVscodeMock(vscode);


// Mock TextDecoder
global.TextDecoder = class {
    decode(buffer) {
        return buffer.toString();
    }
};

// Import DefinitionProvider
const {ThriftDefinitionProvider} = require('../out/definitionProvider.js');

async function testExternalIncludeNavigation() {
    console.log('Testing External Include Navigation');

    const sharedThriftPath = path.resolve(__dirname, 'shared_repro.thrift');
    const sharedThriftContent = `
namespace java shared

struct SharedStruct {
    1: i32 id
}
`;
    fs.writeFileSync(sharedThriftPath, sharedThriftContent);

    const mainThriftPath = path.resolve(__dirname, 'main_repro.thrift');
    const mainThriftContent = `
include "shared_repro.thrift"

struct Main {
    1: shared.SharedStruct s
}
`;
    fs.writeFileSync(mainThriftPath, mainThriftContent);

    try {
        const provider = new ThriftDefinitionProvider();

        // Mock the document
        const mainDoc = new vscode.TextDocument(vscode.Uri.file(mainThriftPath), mainThriftContent);

        // Find position of "SharedStruct" in "1: shared.SharedStruct s"
        const targetLineIndex = 4;
        const lineText = mainDoc.lines[targetLineIndex];
        const charIndex = lineText.indexOf('SharedStruct');

        console.log(`Testing cursor at line ${targetLineIndex}, char ${charIndex}`);
        console.log(`Line text: "${lineText}"`);

        const definition = await provider.provideDefinition(
            mainDoc,
            new vscode.Position(targetLineIndex, charIndex),
            new vscode.CancellationToken()
        );

        if (!definition) {
            throw new Error('Definition not found');
        }

        console.log('Definition found at:', definition.uri.fsPath);

        if (definition.uri.fsPath !== sharedThriftPath) {
            throw new Error(`Expected definition in ${sharedThriftPath}, got ${definition.uri.fsPath}`);
        }

        console.log('Definition range start line:', definition.range.start.line);

        console.log('Test Passed!');

    } finally {
        if (fs.existsSync(sharedThriftPath)) fs.unlinkSync(sharedThriftPath);
        if (fs.existsSync(mainThriftPath)) fs.unlinkSync(mainThriftPath);
    }
}

testExternalIncludeNavigation().catch(err => {
    console.error(err);
    process.exit(1);
});
