const assert = require('assert');

const {DiagnosticManager} = require('../../../out/diagnostics');
const {config} = require('../../../out/config/index.js');

describe('incremental-dirty-ranges', () => {
    let originalAnalysisEnabled;
    let originalMaxDirty;
    let latestDiagnostics = [];

    before(() => {
        originalAnalysisEnabled = config.incremental.analysisEnabled;
        originalMaxDirty = config.incremental.maxDirtyLines;
    });

    after(() => {
        config.incremental.analysisEnabled = originalAnalysisEnabled;
        config.incremental.maxDirtyLines = originalMaxDirty;
    });

    function createDoc(text, name, version) {
        const lines = text.split('\n');
        return {
            uri: {
                fsPath: `/tmp/${name}`,
                toString: () => `/tmp/${name}`
            },
            languageId: 'thrift',
            version: version,
            lineCount: lines.length,
            getText: () => text,
            lineAt: (i) => ({text: lines[i] || ''})
        };
    }

    it('should handle diagnostics for dirty ranges incrementally', async () => {
        config.incremental.analysisEnabled = true;
        config.incremental.maxDirtyLines = 10;

        const vscode = require('vscode');
        const originalCreateDiagnosticCollection = vscode.languages.createDiagnosticCollection;

        vscode.languages.createDiagnosticCollection = () => ({
            set: (_uri, diagnostics) => {
                latestDiagnostics = diagnostics;
            },
            clear: () => {
            },
            delete: () => {
            }
        });

        try {
            const manager = new DiagnosticManager();

            const text = [
                'struct A {',
                '  1: i32 id,',
                '  1: i32 name,',
                '}',
                '',
                'struct B {',
                '  1: UnknownType id,',
                '}'
            ].join('\n');

            const doc = createDoc(text, 'incremental-dirty-ranges.thrift', 1);
            await manager.performAnalysis(doc);

            const hasDuplicate = latestDiagnostics.some(diag => /Duplicate field id/.test(diag.message));
            const hasUnknown = latestDiagnostics.some(diag => /Unknown type/.test(diag.message));
            assert.ok(hasDuplicate, 'Should have duplicate field id diagnostic initially');
            assert.ok(hasUnknown, 'Should have unknown type diagnostic initially');

            const updatedText = [
                'struct A {',
                '  1: i32 id,',
                '  2: i32 name,',
                '}',
                '',
                'struct B {',
                '  1: UnknownType id,',
                '}'
            ].join('\n');

            const updatedDoc = createDoc(updatedText, 'incremental-dirty-ranges.thrift', 2);
            manager.scheduleAnalysis(
                updatedDoc,
                true,
                false,
                'documentChange',
                2,
                false,
                {startLine: 1, endLine: 2},
                false,
                [
                    {startLine: 1, endLine: 1},
                    {startLine: 2, endLine: 2}
                ]
            );
            await manager.performAnalysis(updatedDoc);

            const stillHasUnknown = latestDiagnostics.some(diag => /Unknown type/.test(diag.message));
            const stillHasDuplicate = latestDiagnostics.some(diag => /Duplicate field id/.test(diag.message));
            assert.ok(stillHasUnknown, 'Should preserve unknown type diagnostic');
            assert.ok(!stillHasDuplicate, 'Should clear duplicate field id diagnostic');
        } finally {
            vscode.languages.createDiagnosticCollection = originalCreateDiagnosticCollection;
        }
    });
});