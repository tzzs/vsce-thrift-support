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
    workspace: {
        fs: {
            readFile: async () => new Uint8Array(),
            stat: async () => ({})
        }
    },
    window: {
        showErrorMessage: () => Promise.resolve(undefined),
        createOutputChannel: () => ({
            appendLine: () => {},
            show: () => {}
        })
    }
});
installVscodeMock(vscode);

const {DiagnosticManager} = require('../../../out/diagnostics');

function createDoc(name) {
    const fsPath = `/tmp/${name}`;
    return {
        languageId: 'thrift',
        uri: {
            fsPath,
            toString: () => fsPath
        },
        version: 1,
        getText: () => 'struct User { 1: i32 id }\n'
    };
}

async function run() {
    console.log('\nRunning diagnostics PerformanceMonitor DI test...');

    let called = 0;
    let lastOperation = '';
    const performanceMonitor = {
        measureAsync: async (operation, fn) => {
            called += 1;
            lastOperation = operation;
            return await fn();
        }
    };

    const manager = new DiagnosticManager(undefined, performanceMonitor);
    const doc = createDoc('perf-di.thrift');

    await manager.performAnalysis(doc);

    assert.strictEqual(called, 1, 'Expected injected PerformanceMonitor to be used');
    assert.strictEqual(lastOperation, 'Thrift诊断分析', 'Expected diagnostics operation label');

    console.log('✅ Diagnostics PerformanceMonitor DI test passed!');
}

run().catch((err) => {
    console.error('❌ Diagnostics PerformanceMonitor DI test failed:', err);
    process.exit(1);
});
