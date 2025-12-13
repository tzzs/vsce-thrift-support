
module.exports = {
    Range: class {
        constructor(a, b, c, d) {
            this.start = { line: a, character: b };
            this.end = { line: c, character: d };
        }
    },
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
            set: () => { },
            delete: () => { },
            clear: () => { }
        })
    },
    workspace: {
        onDidOpenTextDocument: () => { return { dispose: () => { } }; },
        onDidChangeTextDocument: () => { return { dispose: () => { } }; },
        onDidSaveTextDocument: () => { return { dispose: () => { } }; },
        onDidCloseTextDocument: () => { return { dispose: () => { } }; },
        openTextDocument: async () => ({ getText: () => "" })
    },
    window: {
        activeTextEditor: null
    },
    Uri: {
        file: (path) => ({ fsPath: path, toString: () => path })
    }
};
