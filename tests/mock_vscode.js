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

function mergeDeep(target, source) {
    if (!source) {
        return {...target};
    }
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
        })
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
