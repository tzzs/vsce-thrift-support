const {
    createVscodeMock: baseCreateVscodeMock,
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
    SelectionRange,
    DocumentSymbol,
    SymbolKind,
    Hover,
    MarkdownString,
    SymbolInformation,
    FoldingRange
} = require('./test-helpers/vscode-mock');

// Shared VSCode API helpers for tests.
class WorkspaceEdit {
    constructor() {
        this.edits = [];
    }

    replace(uri, range, newText) {
        this.edits.push({type: 'replace', uri, range, newText});
    }

    insert(uri, position, newText) {
        this.edits.push({type: 'insert', uri, position, newText});
    }

    delete(uri, range) {
        this.edits.push({type: 'delete', uri, range});
    }
}

class Selection {
    constructor(start, end) {
        this.start = start;
        this.end = end;
    }
}

const CodeActionKind = {
    Refactor: 'refactor',
    RefactorExtract: 'refactor.extract',
    RefactorMove: 'refactor.move',
    QuickFix: 'quickfix'
};

class CodeAction {
    constructor(title, kind) {
        this.title = title;
        this.kind = kind;
        this.edit = null;
        this.isPreferred = false;
    }
}

// --- Phase 6A/6B/6C/6D mocks ---

class SemanticTokensLegend {
    constructor(tokenTypes, tokenModifiers) {
        this.tokenTypes = Array.isArray(tokenTypes) ? tokenTypes.slice() : [];
        this.tokenModifiers = Array.isArray(tokenModifiers) ? tokenModifiers.slice() : [];
    }
}

class SemanticTokens {
    constructor(data, resultId) {
        this.data = data instanceof Uint32Array ? data : new Uint32Array(data || []);
        this.resultId = resultId;
    }
}

// Minimal SemanticTokensBuilder mimicking VS Code's behavior: collects
// (line, char, length, tokenType, modifierMask) and serializes to a delta-encoded
// Uint32Array on build(). Sufficient for unit tests verifying tokens.
class SemanticTokensBuilder {
    constructor(legend) {
        this.legend = legend;
        this.entries = [];
    }

    push(rangeOrLine, tokenTypeOrChar, modifiersOrLen, _typeOrUndefined, _modOrUndefined) {
        if (typeof rangeOrLine === 'object' && rangeOrLine && rangeOrLine.start && rangeOrLine.end) {
            // push(range, tokenType, tokenModifiers?)
            const range = rangeOrLine;
            const tokenType = tokenTypeOrChar;
            const tokenModifiers = modifiersOrLen;
            const line = range.start.line;
            const startChar = range.start.character;
            const length = range.end.character - range.start.character;
            const tokenTypeIdx = this.legend && Array.isArray(this.legend.tokenTypes)
                ? this.legend.tokenTypes.indexOf(tokenType)
                : -1;
            let modMask = 0;
            if (Array.isArray(tokenModifiers) && this.legend && Array.isArray(this.legend.tokenModifiers)) {
                for (const m of tokenModifiers) {
                    const idx = this.legend.tokenModifiers.indexOf(m);
                    if (idx >= 0) {
                        modMask |= (1 << idx);
                    }
                }
            }
            this.entries.push({line, startChar, length, tokenType: tokenTypeIdx, tokenModifiers: modMask});
        } else {
            // push(line, char, length, tokenTypeIdx, modifierMask)
            this.entries.push({
                line: rangeOrLine,
                startChar: tokenTypeOrChar,
                length: modifiersOrLen,
                tokenType: _typeOrUndefined,
                tokenModifiers: _modOrUndefined || 0
            });
        }
    }

    build(resultId) {
        // Delta encode like VS Code
        const arr = [];
        let lastLine = 0;
        let lastChar = 0;
        for (const entry of this.entries) {
            const deltaLine = entry.line - lastLine;
            const deltaChar = deltaLine === 0 ? entry.startChar - lastChar : entry.startChar;
            arr.push(deltaLine, deltaChar, entry.length, entry.tokenType, entry.tokenModifiers);
            lastLine = entry.line;
            lastChar = entry.startChar;
        }
        return new SemanticTokens(new Uint32Array(arr), resultId);
    }
}

class CallHierarchyItem {
    constructor(kind, name, detail, uri, range, selectionRange) {
        this.kind = kind;
        this.name = name;
        this.detail = detail;
        this.uri = uri;
        this.range = range;
        this.selectionRange = selectionRange;
    }
}

class CallHierarchyIncomingCall {
    constructor(from, fromRanges) {
        this.from = from;
        this.fromRanges = fromRanges;
    }
}

class CallHierarchyOutgoingCall {
    constructor(to, fromRanges) {
        this.to = to;
        this.fromRanges = fromRanges;
    }
}

class TypeHierarchyItem {
    constructor(kind, name, detail, uri, range, selectionRange) {
        this.kind = kind;
        this.name = name;
        this.detail = detail;
        this.uri = uri;
        this.range = range;
        this.selectionRange = selectionRange;
    }
}

const DocumentHighlightKind = {
    Text: 0,
    Read: 1,
    Write: 2
};

class DocumentHighlight {
    constructor(range, kind) {
        this.range = range;
        this.kind = kind === undefined ? DocumentHighlightKind.Text : kind;
    }
}

function mergeDeep(target, source) {
    if (!source) {
        return {...target};
    }
    const output = {...target};
    Object.keys(source).forEach((key) => {
        if (key === '__proto__' || key === 'constructor') return;
        const value = source[key];
        if (value && typeof value === 'object' && !Array.isArray(value)) {
            output[key] = mergeDeep(target[key] || {}, value);
        } else {
            output[key] = value;
        }
    });
    return output;
}

function createWorkspaceInstance() {
    const workspaceClone = {
        ...commonDefaults.workspace,
        fs: {
            ...commonDefaults.workspace.fs
        }
    };
    workspaceClone.textDocuments = [];
    return workspaceClone;
}

const commonDefaults = {
    WorkspaceEdit,
    Selection,
    CodeActionKind,
    CodeAction,
    window: {
        activeTextEditor: null,
        showInformationMessage: () => Promise.resolve(),
        showWarningMessage: () => Promise.resolve(),
        showErrorMessage: () => Promise.resolve(),
        createOutputChannel: () => ({
            appendLine: () => {
            },
            show: () => {
            },
            dispose: () => {
            }
        })
    },
    languages: {
        createDiagnosticCollection: () => ({
            set: () => {
            },
            clear: () => {
            },
            delete: () => {
            },
            dispose: () => {
            }
        }),
        registerDocumentSemanticTokensProvider: () => ({dispose: () => {}}),
        registerCallHierarchyProvider: () => ({dispose: () => {}}),
        registerTypeHierarchyProvider: () => ({dispose: () => {}}),
        registerDocumentHighlightProvider: () => ({dispose: () => {}})
    },
    workspace: {
        findFiles: async () => [],
        openTextDocument: async (uri) => {
            const fs = require('fs');
            const text = fs.readFileSync(typeof uri === 'string' ? uri : uri.fsPath, 'utf8');
            return createTextDocument(text, uri);
        },
        fs: {
            readFile: async () => Buffer.from(''),
            writeFile: async () => {
            },
            delete: async () => {
            },
            stat: async () => ({size: 0, mtime: 0, type: 1})
        },
        textDocuments: [],
        createFileSystemWatcher: () => ({
            onDidCreate: () => ({
                dispose: () => {
                }
            }),
            onDidChange: () => ({
                dispose: () => {
                }
            }),
            onDidDelete: () => ({
                dispose: () => {
                }
            }),
            dispose: () => {
            }
        }),
        onDidOpenTextDocument: () => ({
            dispose: () => {
            }
        }),
        onDidChangeTextDocument: () => ({
            dispose: () => {
            }
        }),
        onDidSaveTextDocument: () => ({
            dispose: () => {
            }
        }),
        onDidCloseTextDocument: () => ({
            dispose: () => {
            }
        }),
        getConfiguration: () => ({
            get: (key, defaultValue) => defaultValue
        })
    }
};

function mergeInPlace(target, source) {
    if (!source || typeof source !== 'object') return target;
    Object.keys(source).forEach((key) => {
        if (key === '__proto__' || key === 'constructor') return;
        const value = source[key];
        if (
            value &&
            typeof value === 'object' &&
            !Array.isArray(value) &&
            target[key] &&
            typeof target[key] === 'object' &&
            typeof target[key] !== 'function'
        ) {
            mergeInPlace(target[key], value);
        } else {
            target[key] = value;
        }
    });
    return target;
}

function createVscodeMock(overrides = {}) {
    return baseCreateVscodeMock(mergeDeep(commonDefaults, overrides));
}

function TextDocumentFactory(uri, text) {
    const doc = createTextDocument(text, uri);
    if (this instanceof TextDocumentFactory) {
        Object.assign(this, doc);
        return this;
    }
    return doc;
}

// Create the base vscode mock with all necessary classes
const vscode = createVscodeMock();

// Ensure CodeActionKind and CodeAction are properly set
vscode.CodeActionKind = CodeActionKind;
vscode.CodeAction = CodeAction;
vscode.WorkspaceEdit = WorkspaceEdit;
vscode.Selection = Selection;

// Phase 6A/6B/6C/6D constructors and enums
vscode.SemanticTokensLegend = SemanticTokensLegend;
vscode.SemanticTokens = SemanticTokens;
vscode.SemanticTokensBuilder = SemanticTokensBuilder;
vscode.CallHierarchyItem = CallHierarchyItem;
vscode.CallHierarchyIncomingCall = CallHierarchyIncomingCall;
vscode.CallHierarchyOutgoingCall = CallHierarchyOutgoingCall;
vscode.TypeHierarchyItem = TypeHierarchyItem;
vscode.DocumentHighlight = DocumentHighlight;
vscode.DocumentHighlightKind = DocumentHighlightKind;

// Ensure languages is properly set
if (!vscode.languages) {
    vscode.languages = commonDefaults.languages;
}

// Ensure window is properly set with all methods
if (!vscode.window || typeof vscode.window !== 'object') {
    vscode.window = {...commonDefaults.window};
}

let currentWorkspace = createWorkspaceInstance();

Object.defineProperty(vscode, 'workspace', {
    get: () => currentWorkspace,
    set: (value) => {
        if (value && typeof value === 'object') {
            // Merge with defaults to preserve methods
            currentWorkspace = {...createWorkspaceInstance(), ...value};
        }
    },
    configurable: true,
    enumerable: true
});

// Important for TypeScript __importStar
vscode.__esModule = true;

Object.assign(vscode, {
    languages: vscode.languages || commonDefaults.languages,  // Preserve languages
    DiagnosticSeverity: {
        Error: 0,
        Warning: 1,
        Information: 2,
        Hint: 3
    },
    createVscodeMock: (overrides = {}) => {
        if (overrides && typeof overrides === 'object') {
            mergeInPlace(vscode, overrides);
        }
        return vscode;
    },
    installVscodeMock: () => {
        // Already installed via require-hook.js
    },
    restoreVscodeMock: () => {
        // Handled by require-hook.js
    },
    withTempFile,
    createTextDocument,
    getWordRangeAtPositionFromText,
    Position,
    Range,
    Location,
    Uri,
    TextDocument: TextDocumentFactory,
    SelectionRange,
    TextEdit,
    DocumentSymbol,
    SymbolKind,
    Hover,
    MarkdownString,
    SymbolInformation,
    FoldingRange,
    WorkspaceEdit,
    Selection,
    CodeActionKind,
    CodeAction,
    reset: () => {
        // Restore core classes (in case they were overridden)
        vscode.Position = Position;
        vscode.Range = Range;
        vscode.Location = Location;
        vscode.Uri = Uri;
        vscode.SelectionRange = SelectionRange;
        vscode.WorkspaceEdit = WorkspaceEdit;
        vscode.Selection = Selection;
        vscode.CodeAction = CodeAction;
        vscode.CodeActionKind = CodeActionKind;
        vscode.languages = commonDefaults.languages;

        // Reset workspace to a fresh snapshot so tests always start from the same state.
        currentWorkspace = createWorkspaceInstance();

        // Reset window methods to defaults
        Object.assign(vscode.window, commonDefaults.window);
        vscode.window.activeTextEditor = commonDefaults.window.activeTextEditor;
    }
});

module.exports = vscode;
