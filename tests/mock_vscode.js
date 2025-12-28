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
    DocumentSymbol,
    SymbolKind
} = require('./test-helpers/vscode-mock');

// Shared VSCode API helpers for tests.
class WorkspaceEdit {
    constructor() {
        this.edits = [];
    }
    replace(uri, range, newText) {
        this.edits.push({ type: 'replace', uri, range, newText });
    }
    insert(uri, position, newText) {
        this.edits.push({ type: 'insert', uri, position, newText });
    }
    delete(uri, range) {
        this.edits.push({ type: 'delete', uri, range });
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
        return { ...target };
    }
    const output = { ...target };
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

const commonDefaults = {
    WorkspaceEdit,
    Selection,
    CodeActionKind,
    CodeAction,
    window: {
        activeTextEditor: null,
        showInformationMessage: () => {},
        showErrorMessage: () => {}
    },
    workspace: {
        findFiles: async () => []
    }
};

function createVscodeMock(overrides = {}) {
    return baseCreateVscodeMock(mergeDeep(commonDefaults, overrides));
}

const vscode = createVscodeMock();

Object.assign(vscode, {
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
    SymbolKind,
    WorkspaceEdit,
    Selection,
    CodeActionKind,
    CodeAction
});

module.exports = vscode;
