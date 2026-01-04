const assert = require('assert');

const {createVscodeMock, installVscodeMock} = require('../../mock_vscode.js');

const vscode = createVscodeMock({
    languages: {
        createDiagnosticCollection: () => ({
            set: () => {},
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

function createDoc(pathSuffix) {
    const fsPath = `/tmp/${pathSuffix}`;
    return {
        languageId: 'thrift',
        uri: {
            fsPath,
            toString: () => fsPath
        },
        version: 1
    };
}

function run() {
    console.log('\nRunning incremental diagnostics analysis test...');

    const originalAnalysisEnabled = config.incremental.analysisEnabled;
    const originalMaxDirty = config.incremental.maxDirtyLines;
    config.incremental.analysisEnabled = true;
    config.incremental.maxDirtyLines = 5;

    const originalSetTimeout = global.setTimeout;
    const originalClearTimeout = global.clearTimeout;
    global.setTimeout = () => 0;
    global.clearTimeout = () => {};

    try {
        const manager = new DiagnosticManager();
        let dependentCalls = 0;
        manager.getDependentFiles = () => {
            dependentCalls += 1;
            return ['fileB.thrift'];
        };

        const doc = createDoc('fileA.thrift');
        manager.scheduleAnalysis(doc, false, false, 'documentChange', 3, false);
        assert.strictEqual(dependentCalls, 0, 'Expected dependents to be skipped for small changes');

        doc.version = 2;
        manager.scheduleAnalysis(doc, false, false, 'documentChange', 3, true);
        assert.strictEqual(dependentCalls, 1, 'Expected dependents when includes may change');

        console.log('✅ Incremental analysis scheduling test passed!');
    } finally {
        config.incremental.analysisEnabled = originalAnalysisEnabled;
        config.incremental.maxDirtyLines = originalMaxDirty;
        global.setTimeout = originalSetTimeout;
        global.clearTimeout = originalClearTimeout;
    }
}

run();
