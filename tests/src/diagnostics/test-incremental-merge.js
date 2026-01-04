const assert = require('assert');

const {createVscodeMock, installVscodeMock} = require('../../mock_vscode.js');

let latestDiagnostics = [];
const vscode = createVscodeMock({
    languages: {
        createDiagnosticCollection: () => ({
            set: (_uri, diagnostics) => {
                latestDiagnostics = diagnostics;
            },
            clear: () => {},
            delete: () => {}
        })
    },
    window: {
        showErrorMessage: () => Promise.resolve(undefined)
    }
});
installVscodeMock(vscode);

const {DiagnosticManager} = require('../../../out/diagnostics.js');
const {config} = require('../../../out/config/index.js');

function createDoc(text, name, version) {
    const uri = vscode.Uri.file(`/tmp/${name}`);
    const doc = vscode.createTextDocument(text, uri);
    doc.languageId = 'thrift';
    doc.uri = uri;
    doc.version = version;
    doc.lineCount = text.split('\n').length;
    return doc;
}

async function run() {
    console.log('\nRunning incremental diagnostics merge test...');

    const originalAnalysisEnabled = config.incremental.analysisEnabled;
    const originalMaxDirty = config.incremental.maxDirtyLines;
    config.incremental.analysisEnabled = true;
    config.incremental.maxDirtyLines = 5;

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

        const doc = createDoc(text, 'incremental-merge.thrift', 1);
        await manager.performAnalysis(doc);

        assert.ok(latestDiagnostics.length >= 2, 'Expected initial diagnostics to include multiple issues');
        const hasUnknownType = latestDiagnostics.some(diag => /Unknown type/.test(diag.message));
        assert.ok(hasUnknownType, 'Expected unknown type diagnostic in initial run');

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

        const updatedDoc = createDoc(updatedText, 'incremental-merge.thrift', 2);
        manager.scheduleAnalysis(updatedDoc, true, false, 'documentChange', 1, false, { startLine: 2, endLine: 2 }, false);
        await manager.performAnalysis(updatedDoc);

        const stillHasUnknownType = latestDiagnostics.some(diag => /Unknown type/.test(diag.message));
        assert.ok(stillHasUnknownType, 'Expected unknown type diagnostic to be preserved');
        const hasDuplicate = latestDiagnostics.some(diag => /Duplicate field id/.test(diag.message));
        assert.ok(!hasDuplicate, 'Expected duplicate field id diagnostic to be cleared after update');

        console.log('✅ Incremental diagnostics merge test passed!');
    } finally {
        config.incremental.analysisEnabled = originalAnalysisEnabled;
        config.incremental.maxDirtyLines = originalMaxDirty;
    }
}

run();
