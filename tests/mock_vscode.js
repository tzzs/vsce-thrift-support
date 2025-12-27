const {createVscodeMock} = require('./test-helpers/vscode-mock');

// Minimal VSCode API mock used by dependency tests.
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

module.exports = createVscodeMock({
    WorkspaceEdit,
    Position: class {
        constructor(line, character) {
            this.line = line;
            this.character = character;
        }
    },
    Range: class {
        constructor(startLineOrStart, startCharOrEnd, endLine, endChar) {
            if (startLineOrStart && typeof startLineOrStart === 'object' &&
                startCharOrEnd && typeof startCharOrEnd === 'object') {
                this.start = startLineOrStart;
                this.end = startCharOrEnd;
            } else {
                this.start = {line: startLineOrStart, character: startCharOrEnd};
                this.end = {line: endLine, character: endChar};
            }
        }
    },
    Selection: class {
        constructor(start, end) {
            this.start = start;
            this.end = end;
        }
    },
    Uri: {
        file: (p) => ({
            fsPath: p,
            toString() {return `file://${p}`;}
        })
    },
    workspace: {
        openTextDocument: async () => ({getText: () => ''}),
        findFiles: async () => []
    },
    CodeActionKind: {
        Refactor: 'refactor',
        RefactorExtract: 'refactor.extract',
        RefactorMove: 'refactor.move',
        QuickFix: 'quickfix'
    },
    CodeAction: class {
        constructor(title, kind) {
            this.title = title;
            this.kind = kind;
            this.edit = null;
            this.isPreferred = false;
        }
    },
    window: {
        activeTextEditor: null
    }
});
