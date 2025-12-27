const fs = require('fs');
const path = require('path');
const Module = require('module');

class Position {
    constructor(line, character) {
        this.line = line;
        this.character = character;
    }
}

class Range {
    constructor(startLineOrStart, startCharacterOrEnd, endLine, endCharacter) {
        if (startLineOrStart && typeof startLineOrStart === 'object' && startCharacterOrEnd && typeof startCharacterOrEnd === 'object') {
            this.start = startLineOrStart;
            this.end = startCharacterOrEnd;
        } else {
            this.start = new Position(startLineOrStart, startCharacterOrEnd);
            this.end = new Position(endLine, endCharacter);
        }
    }

    contains(position) {
        return position.line >= this.start.line &&
            position.line <= this.end.line &&
            (position.line !== this.start.line || position.character >= this.start.character) &&
            (position.line !== this.end.line || position.character <= this.end.character);
    }
}

class Location {
    constructor(uri, range) {
        this.uri = uri;
        this.range = range;
    }
}

class Uri {
    constructor(scheme, authority, pathValue, query, fragment) {
        this.scheme = scheme;
        this.authority = authority;
        this.path = pathValue;
        this.query = query;
        this.fragment = fragment;
        this.fsPath = pathValue;
    }

    static file(filePath) {
        return new Uri('file', '', filePath, '', '');
    }

    toString() {
        return `file://${this.path}`;
    }
}

class TextEdit {
    static replace(range, newText) {
        return {range, newText};
    }
}

class DocumentSymbol {
    constructor(name, detail, kind, range, selectionRange) {
        this.name = name;
        this.detail = detail;
        this.kind = kind;
        this.range = range;
        this.selectionRange = selectionRange;
        this.children = [];
    }
}

const SymbolKind = {
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
};

function getWordRangeAtPositionFromText(text, position) {
    const lines = text.split('\n');
    if (position.line >= lines.length) {return null;}

    const lineText = lines[position.line] || '';
    if (position.character > lineText.length) {return null;}

    const wordRegex = /\b([A-Za-z_][A-Za-z0-9_]*)\b/g;
    let match;
    while ((match = wordRegex.exec(lineText)) !== null) {
        if (position.character >= match.index && position.character <= match.index + match[0].length) {
            return new Range(
                new Position(position.line, match.index),
                new Position(position.line, match.index + match[0].length)
            );
        }
    }
    return null;
}

function createTextDocument(text, uri) {
    const lines = text.split('\n');
    return {
        uri,
        getText: (range) => {
            if (!range) {return text;}
            const startLine = range.start.line;
            const endLine = range.end.line;
            const startChar = range.start.character;
            const endChar = range.end.character;

            if (startLine === endLine) {
                return (lines[startLine] || '').substring(startChar, endChar);
            }
            let result = (lines[startLine] || '').substring(startChar);
            for (let i = startLine + 1; i < endLine; i++) {
                result += '\n' + (lines[i] || '');
            }
            result += '\n' + (lines[endLine] || '').substring(0, endChar);
            return result;
        },
        lineAt: (line) => ({text: lines[line] || ''}),
        positionAt: (offset) => {
            let currentOffset = 0;
            for (let line = 0; line < lines.length; line++) {
                const lineLength = (lines[line] || '').length + 1;
                if (offset <= currentOffset + lineLength - 1) {
                    const character = offset - currentOffset;
                    return new Position(line, Math.max(0, character));
                }
                currentOffset += lineLength;
            }
            const lastLine = lines.length - 1;
            return new Position(lastLine, (lines[lastLine] || '').length);
        },
        getWordRangeAtPosition: (position) => getWordRangeAtPositionFromText(text, position)
    };
}

function mergeDeep(target, source) {
    if (!source) {return target;}
    const output = {...target};
    Object.keys(source).forEach((key) => {
        const value = source[key];
        if (value && typeof value === 'object' && !Array.isArray(value)) {
            output[key] = mergeDeep(target[key] || {}, value);
        } else {
            output[key] = value;
        }
    });
    return output;
}

function createVscodeMock(overrides = {}) {
    const defaultWorkspace = {
        textDocuments: [],
        fs: {
            readFile: async (uri) => fs.readFileSync(uri.fsPath || uri),
            stat: async (uri) => fs.statSync(uri.fsPath || uri),
            createFileSystemWatcher: () => ({
                onDidCreate: () => {},
                onDidChange: () => {},
                onDidDelete: () => {},
                dispose: () => {}
            })
        },
        createFileSystemWatcher: () => ({
            onDidCreate: () => {},
            onDidChange: () => {},
            onDidDelete: () => {},
            dispose: () => {}
        }),
        openTextDocument: async (uri) => {
            const content = fs.readFileSync(uri.fsPath || uri, 'utf8');
            return createTextDocument(content, uri);
        },
        getConfiguration: () => ({get: (_key, def) => def}),
        findFiles: async () => [],
        onDidOpenTextDocument: () => ({dispose: () => {}}),
        onDidChangeTextDocument: () => ({dispose: () => {}}),
        onDidSaveTextDocument: () => ({dispose: () => {}}),
        onDidCloseTextDocument: () => ({dispose: () => {}})
    };

    const base = {
        Position,
        Range,
        Location,
        Uri,
        TextEdit,
        DocumentSymbol,
        SymbolKind,
        DiagnosticSeverity: {
            Error: 0,
            Warning: 1,
            Information: 2,
            Hint: 3
        },
        Diagnostic: class {
            constructor(range, message, severity) {
                this.range = range;
                this.message = message;
                this.severity = severity;
            }
        },
        languages: {
            createDiagnosticCollection: () => ({
                set: () => {},
                delete: () => {},
                clear: () => {}
            })
        },
        workspace: defaultWorkspace,
        window: {
            activeTextEditor: null,
            showInformationMessage: () => {},
            showErrorMessage: () => {}
        },
        getWordRangeAtPositionFromText,
        createTextDocument
    };

    return mergeDeep(base, overrides);
}

let activeRestore = null;

function installVscodeMock(vscode) {
    const originalLoad = Module._load;
    Module._load = function (request, parent, isMain) {
        if (request === 'vscode') {return vscode;}
        return originalLoad.apply(this, arguments);
    };
    activeRestore = () => {
        Module._load = originalLoad;
    };
    return activeRestore;
}

function restoreVscodeMock() {
    if (activeRestore) {
        activeRestore();
        activeRestore = null;
    }
}

function withTempFile(content, ext, fn, dir) {
    const tempDir = dir || path.join(__dirname, '..', 'tmp');
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, {recursive: true});
    }
    const filename = `temp-${Date.now()}-${Math.random().toString(16).slice(2)}${ext || ''}`;
    const filePath = path.join(tempDir, filename);
    fs.writeFileSync(filePath, content);
    const result = fn(filePath);
    const cleanup = () => {
        if (fs.existsSync(filePath)) {
            try {
                fs.unlinkSync(filePath);
            } catch (error) {
                console.warn(`Temp file cleanup failed: ${filePath} (${error.message})`);
            }
        }
    };
    if (result && typeof result.then === 'function') {
        return result.finally(cleanup);
    }
    cleanup();
    return result;
}

module.exports = {
    createVscodeMock,
    installVscodeMock,
    restoreVscodeMock,
    withTempFile,
    createTextDocument,
    getWordRangeAtPositionFromText,
    Position,
    Range,
    Location,
    Uri,
    TextEdit,
    DocumentSymbol,
    SymbolKind
};
