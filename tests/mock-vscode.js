// Mock vscode module for testing
const path = require('path');

class Position {
    constructor(line, character) {
        this.line = line;
        this.character = character;
    }
}

class Range {
    constructor(startLineOrStart, startCharacterOrEnd, endLine, endCharacter) {
        if (startLineOrStart instanceof Position && startCharacterOrEnd instanceof Position) {
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
    constructor(scheme, authority, path, query, fragment) {
        this.scheme = scheme;
        this.authority = authority;
        this.path = path;
        this.query = query;
        this.fragment = fragment;
        this.fsPath = path;
    }

    static file(path) {
        return new Uri('file', '', path, '', '');
    }

    toString() {
        return `file://${this.path}`;
    }
}

// Add getWordRangeAtPosition helper function
function getWordRangeAtPositionFromText(text, position) {
    const lines = text.split('\n');
    if (position.line >= lines.length) return null;

    const lineText = lines[position.line] || '';
    if (position.character > lineText.length) return null;

    // 使用单词边界更精确地匹配
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

// Export the helper function
module.exports.getWordRangeAtPositionFromText = getWordRangeAtPositionFromText;

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

const workspace = {
    textDocuments: [],
    fs: {
        readFile: async (uri) => {
            const fs = require('fs');
            const fsPath = uri.fsPath || uri;
            return fs.readFileSync(fsPath);
        },
        createFileSystemWatcher: (globPattern, ignoreCreate, ignoreChange, ignoreDelete) => {
            // Return a mock file system watcher
            return {
                onDidCreate: (callback) => {
                },
                onDidChange: (callback) => {
                },
                onDidDelete: (callback) => {
                },
                dispose: () => {
                }
            };
        }
    },
    createFileSystemWatcher: (globPattern, ignoreCreate, ignoreChange, ignoreDelete) => {
        // Return a mock file system watcher
        return {
            onDidCreate: (callback) => {
            },
            onDidChange: (callback) => {
            },
            onDidDelete: (callback) => {
            },
            dispose: () => {
            }
        };
    }
};

module.exports = {
    Position,
    Range,
    Location,
    Uri,
    DocumentSymbol,
    SymbolKind,
    workspace,
    getWordRangeAtPositionFromText
};