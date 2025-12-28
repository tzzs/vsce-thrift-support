// Debug script to format the example.thrift file and print lines around 109-113

// Mock minimal vscode API used by out/formattingProvider.js
const path = require('path');
const fs = require('fs');

const mockVscode = {
    workspace: {
        getConfiguration: (section) => {
            if (section === 'thrift.format') {
                return {
                    get: (key, def) => {
                        const overrides = {
                            alignComments: true,
                            alignTypes: true,
                            alignFieldNames: true,
                            alignEnumNames: true,
                            alignEnumEquals: true,
                            alignEnumValues: true,
                            trailingComma: 'preserve',
                            indentSize: 4,
                            maxLineLength: 120,
                            collectionStyle: 'preserve',
                        };
                        return Object.prototype.hasOwnProperty.call(overrides, key) ? overrides[key] : def;
                    }
                };
            }
            return {get: (_, d) => d};
        }
    },
    Range: class {
        constructor(start, end) {
            this.start = start;
            this.end = end;
        }
    },
    Position: class {
        constructor(line, character) {
            this.line = line;
            this.character = character;
        }
    },
    TextEdit: class {
        static replace(range, newText) {
            return {range, newText};
        }
    }
};

// Inject mock before requiring formatter
const Module = require('module');
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
    if (request === 'vscode') {
        return mockVscode;
    }
    return originalLoad.apply(this, arguments);
};

const {ThriftFormattingProvider} = require(path.resolve(__dirname, '../out/formattingProvider.js'));

function run() {
    const filePath = path.resolve(__dirname, '../test-files/example.thrift');
    const text = fs.readFileSync(filePath, 'utf8');

    // Create a lightweight mock document compatible with provider's expectations
    const doc = {
        getText: (range) => {
            if (!range) return text;
            const start = positionToOffset(text, range.start);
            const end = positionToOffset(text, range.end);
            return text.slice(start, end);
        },
        positionAt: (offset) => offsetToPosition(text, offset)
    };

    const provider = new ThriftFormattingProvider();
    const options = {insertSpaces: true, tabSize: 4};

    const fullRange = new mockVscode.Range(new mockVscode.Position(0, 0), new mockVscode.Position(0, 0));
    fullRange.start = doc.positionAt(0);
    fullRange.end = doc.positionAt(text.length);

    const edits = provider.provideDocumentFormattingEdits(doc, options, {});
    const formatted = edits && edits[0] ? edits[0].newText : text;

    // Print original and formatted slices around lines 104-116 for context
    const origLines = text.split('\n');
    const fmtLines = formatted.split('\n');

    const startLine = 104; // 1-based for readability
    const endLine = Math.min(fmtLines.length, 116);
    console.log('--- Original (lines ' + startLine + '-' + endLine + ') ---');
    for (let i = startLine - 1; i < endLine; i++) {
        console.log(String(i + 1).padStart(3, ' ') + ': ' + (origLines[i] ?? ''));
    }
    console.log('\n--- Formatted (lines ' + startLine + '-' + endLine + ') ---');
    for (let i = startLine - 1; i < endLine; i++) {
        console.log(String(i + 1).padStart(3, ' ') + ': ' + (fmtLines[i] ?? ''));
    }
}

function positionToOffset(text, pos) {
    const lines = text.split('\n');
    let offset = 0;
    for (let i = 0; i < pos.line; i++) {
        offset += lines[i].length + 1; // +1 for newline
    }
    return offset + pos.character;
}

function offsetToPosition(text, offset) {
    let line = 0, char = 0;
    for (let i = 0, count = 0; i < text.length && count < offset; i++, count++) {
        if (text[i] === '\n') {
            line++;
            char = 0;
        } else {
            char++;
        }
    }
    return new mockVscode.Position(line, char);
}

run();
