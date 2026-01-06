const assert = require('assert');

const {createVscodeMock, installVscodeMock} = require('../../mock_vscode.js');

let handledErrors = 0;
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
            readFile: async () => { throw new Error('missing include'); },
            stat: async () => { throw new Error('missing include'); }
        }
    },
    window: {
        showErrorMessage: () => Promise.resolve(undefined)
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
        getText: () => 'include "missing.thrift"\n'
    };
}

async function run() {
    console.log('\nRunning diagnostics DI injection test...');

    const errorHandler = {
        handleError: () => {
            handledErrors += 1;
        }
    };

    const manager = new DiagnosticManager(errorHandler);
    const doc = createDoc('di-injection.thrift');

    await manager.performAnalysis(doc);

    assert.strictEqual(handledErrors, 1, 'Expected injected error handler to be used');

    console.log('✅ Diagnostics DI injection test passed!');
}

run().catch((err) => {
    console.error('❌ Diagnostics DI injection test failed:', err);
    process.exit(1);
});
