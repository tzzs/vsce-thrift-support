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

const {DiagnosticManager} = require('../../../out/diagnostics');
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
    console.log('\nRunning incremental diagnostics dirty ranges test...');

    const originalAnalysisEnabled = config.incremental.analysisEnabled;
    const originalMaxDirty = config.incremental.maxDirtyLines;
    config.incremental.analysisEnabled = true;
    config.incremental.maxDirtyLines = 10;

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
        assert.ok(hasDuplicate, 'Expected duplicate field id diagnostic in initial run');
        assert.ok(hasUnknown, 'Expected unknown type diagnostic in initial run');

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
            { startLine: 1, endLine: 2 },
            false,
            [
                { startLine: 1, endLine: 1 },
                { startLine: 2, endLine: 2 }
            ]
        );
        await manager.performAnalysis(updatedDoc);

        const stillHasUnknown = latestDiagnostics.some(diag => /Unknown type/.test(diag.message));
        const stillHasDuplicate = latestDiagnostics.some(diag => /Duplicate field id/.test(diag.message));
        assert.ok(stillHasUnknown, 'Expected unknown type diagnostic to be preserved');
        assert.ok(!stillHasDuplicate, 'Expected duplicate field id diagnostic to be cleared');

        console.log('✅ Incremental diagnostics dirty ranges test passed!');
    } finally {
        config.incremental.analysisEnabled = originalAnalysisEnabled;
        config.incremental.maxDirtyLines = originalMaxDirty;
    }
}

run();
