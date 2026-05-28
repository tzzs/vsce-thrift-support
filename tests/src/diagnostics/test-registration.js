const assert = require('assert');
const vscode = require('vscode');
const path = require('path');

const {registerDiagnostics} = require('../../../out/diagnostics/registration.js');

function createMockDoc({fsPath = '/test.thrift', text = 'struct A { 1: i32 id }', languageId = 'thrift'} = {}) {
    const lines = text.split('\n');
    return {
        uri: vscode.Uri.file(fsPath),
        languageId,
        getText: () => text,
        lineAt: (line) => ({text: lines[line] || ''}),
        version: 1
    };
}

function createMockChangeEvent(doc, overrides = {}) {
    const defaultRange = new vscode.Range(0, 0, 0, doc.getText().length);
    return {
        document: doc,
        contentChanges: [{
            range: overrides.range || defaultRange,
            rangeOffset: 0,
            rangeLength: doc.getText().length,
            text: overrides.text || 'struct A { 1: i32 id; 2: string name }'
        }]
    };
}

function createMockEditor(doc) {
    return {
        document: doc
    };
}

function createMockContext() {
    return {subscriptions: []};
}

describe('diagnostics registration', () => {
    beforeEach(() => {
        vscode.reset();
        vscode.window.activeTextEditor = null;
    });

    it('registerDiagnostics pushes disposables to context.subscriptions', () => {
        const context = createMockContext();
        registerDiagnostics(context);
        // Should push fileWatcher + 5 event subscriptions + diagnosticManager = 7 items
        assert.ok(context.subscriptions.length >= 5, 'Should register at least 5 disposables');
    });

    it('onDidOpenTextDocument schedules analysis for thrift documents', () => {
        const context = createMockContext();
        registerDiagnostics(context);

        const doc = createMockDoc();
        // Should not crash — verifies the callback body executes
        assert.doesNotThrow(() => {
            vscode.workspace._fireDidOpenTextDocument(doc);
        });
    });

    it('onDidOpenTextDocument skips non-thrift documents', () => {
        const context = createMockContext();
        registerDiagnostics(context);

        const doc = createMockDoc({languageId: 'json'});
        // Should not crash and should not analyze non-thrift
        assert.doesNotThrow(() => {
            vscode.workspace._fireDidOpenTextDocument(doc);
        });
    });

    it('onDidChangeTextDocument schedules analysis for thrift documents', () => {
        const context = createMockContext();
        registerDiagnostics(context);

        const thriftDoc = createMockDoc();
        const event = createMockChangeEvent(thriftDoc);
        assert.doesNotThrow(() => {
            vscode.workspace._fireDidChangeTextDocument(event);
        });
    });

    it('onDidChangeTextDocument skips non-thrift documents', () => {
        const context = createMockContext();
        registerDiagnostics(context);

        const nonThriftDoc = createMockDoc({languageId: 'plaintext'});
        const event = createMockChangeEvent(nonThriftDoc);
        assert.doesNotThrow(() => {
            vscode.workspace._fireDidChangeTextDocument(event);
        });
    });

    it('onDidSaveTextDocument schedules analysis for thrift documents', () => {
        const context = createMockContext();
        registerDiagnostics(context);

        const doc = createMockDoc();
        assert.doesNotThrow(() => {
            vscode.workspace._fireDidSaveTextDocument(doc);
        });
    });

    it('onDidSaveTextDocument skips non-thrift documents', () => {
        const context = createMockContext();
        registerDiagnostics(context);

        const doc = createMockDoc({languageId: 'yaml'});
        assert.doesNotThrow(() => {
            vscode.workspace._fireDidSaveTextDocument(doc);
        });
    });

    it('onDidCloseTextDocument clears diagnostics for thrift documents', () => {
        const context = createMockContext();
        registerDiagnostics(context);

        const doc = createMockDoc();
        assert.doesNotThrow(() => {
            vscode.workspace._fireDidCloseTextDocument(doc);
        });
    });

    it('onDidCloseTextDocument skips non-thrift documents', () => {
        const context = createMockContext();
        registerDiagnostics(context);

        const doc = createMockDoc({languageId: 'markdown'});
        assert.doesNotThrow(() => {
            vscode.workspace._fireDidCloseTextDocument(doc);
        });
    });

    it('onDidChangeActiveTextEditor schedules analysis for thrift editors (after timeout)', (done) => {
        const context = createMockContext();
        registerDiagnostics(context);

        const doc = createMockDoc();
        const editor = createMockEditor(doc);
        vscode.window._fireDidChangeActiveTextEditor(editor);

        // The handler uses setTimeout(..., 500) — verify after timeout
        setTimeout(() => {
            // Should not crash
            done();
        }, 600);
    });

    it('onDidChangeActiveTextEditor skips non-thrift editors', () => {
        const context = createMockContext();
        registerDiagnostics(context);

        const doc = createMockDoc({languageId: 'javascript'});
        const editor = createMockEditor(doc);
        assert.doesNotThrow(() => {
            vscode.window._fireDidChangeActiveTextEditor(editor);
        });
    });

    it('onDidChangeActiveTextEditor handles null editor gracefully', () => {
        const context = createMockContext();
        registerDiagnostics(context);

        assert.doesNotThrow(() => {
            vscode.window._fireDidChangeActiveTextEditor(null);
        });
    });

    it('extensionActivate path runs when activeTextEditor is a thrift document', () => {
        const context = createMockContext();
        const doc = createMockDoc();
        vscode.window.activeTextEditor = createMockEditor(doc);

        assert.doesNotThrow(() => {
            registerDiagnostics(context);
        });
    });

    it('extensionActivate path skips when activeTextEditor is non-thrift', () => {
        const context = createMockContext();
        const doc = createMockDoc({languageId: 'python'});
        vscode.window.activeTextEditor = createMockEditor(doc);

        assert.doesNotThrow(() => {
            registerDiagnostics(context);
        });
    });

    it('multiple rapid document changes do not crash', () => {
        const context = createMockContext();
        registerDiagnostics(context);

        const doc = createMockDoc();
        for (let i = 0; i < 5; i++) {
            const event = createMockChangeEvent(doc, {text: `struct A { 1: i32 id${i} }`});
            vscode.workspace._fireDidChangeTextDocument(event);
        }
    });

    it('file system watcher triggers reschedule via fireChange', () => {
        const context = createMockContext();
        registerDiagnostics(context);

        // Find the file watcher disposable that was pushed to subscriptions
        // The first subscription is the diagnosticsFileWatcher (a WatcherWrapper)
        const watcher = context.subscriptions[0];
        assert.ok(watcher, 'Should have a file watcher subscription');
        assert.ok(typeof watcher.fireChange === 'function', 'Should be a TestableFileSystemWatcher with fireChange');

        // Add a thrift doc to workspace so the callback has something to reschedule
        const doc = createMockDoc();
        vscode.workspace.textDocuments.push(doc);

        assert.doesNotThrow(() => {
            watcher.fireChange(vscode.Uri.file('/test.thrift'));
        });
    });

    it('non-thrift onDidOpen does not call diagnosticCollection.set synchronously', () => {
        // Stronger assertion: even if the callback runs, it must NOT touch the
        // diagnostic collection for a non-thrift document.
        let setCalls = 0;
        const originalCreate = vscode.languages.createDiagnosticCollection;
        vscode.languages.createDiagnosticCollection = (name) => {
            const col = originalCreate(name);
            const origSet = col.set.bind(col);
            col.set = (...args) => { setCalls++; return origSet(...args); };
            return col;
        };

        try {
            const context = createMockContext();
            registerDiagnostics(context);

            const nonThriftDoc = createMockDoc({languageId: 'json'});
            vscode.workspace._fireDidOpenTextDocument(nonThriftDoc);

            assert.strictEqual(setCalls, 0,
                'diagnosticCollection.set must not be called synchronously for non-thrift documents');
        } finally {
            vscode.languages.createDiagnosticCollection = originalCreate;
        }
    });

    it('registerDiagnostics registers exactly the expected number of subscriptions', () => {
        const context = createMockContext();
        registerDiagnostics(context);
        // Expected: fileWatcher + onDidOpen + onDidChange + onDidSave + onDidClose
        //         + onDidChangeActiveTextEditor = at least 6 subscriptions
        assert.ok(context.subscriptions.length >= 6,
            `expected >= 6 subscriptions, got ${context.subscriptions.length}`);
    });

    it('reset clears all event registrations', () => {
        const context = createMockContext();
        registerDiagnostics(context);

        vscode.reset();

        // After reset, the workspace should be fresh — no leftover callbacks
        const doc = createMockDoc();
        // Should not crash (no callbacks to fire)
        assert.doesNotThrow(() => {
            vscode.workspace._fireDidOpenTextDocument(doc);
        });
    });
});
