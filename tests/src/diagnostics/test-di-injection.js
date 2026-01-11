const assert = require('assert');

// Access the auto-injected mock via require and modify it to trigger error handling
const vscode = require('vscode');

let handledErrors = 0;
const {DiagnosticManager} = require('../../../out/diagnostics');

function createDoc(name, content) {
    const fsPath = `/tmp/${name}`;
    const uri = vscode.Uri.file(fsPath);
    return {
        languageId: 'thrift',
        uri,
        version: 1,
        getText: () => content || 'include "missing.thrift";\nstruct Test { 1: i32 id; }\n'
    };
}

async function run() {
    // Create custom error handler to track calls
    const errorHandler = {
        handleError: (error, context) => {
            handledErrors += 1;
        }
    };

    // Temporarily override the fs methods to simulate a file read error
    const originalReadFile = vscode.workspace.fs.readFile.bind(vscode.workspace.fs);
    const originalStat = vscode.workspace.fs.stat.bind(vscode.workspace.fs);

    try {
        // Override to throw error for any file access to trigger error handling
        vscode.workspace.fs.readFile = async (uri) => {
            // Make any file access fail to ensure error handler is triggered
            const error = new Error('File not found');
            error.code = 'ENOENT';
            throw error;
        };

        vscode.workspace.fs.stat = async (uri) => {
            // Make any file access fail to ensure error handler is triggered
            const error = new Error('File not found');
            error.code = 'ENOENT';
            throw error;
        };

        const manager = new DiagnosticManager(errorHandler);
        const doc = createDoc('di-injection.thrift');

        try {
            await manager.performAnalysis(doc);
        } catch (error) {
            // performAnalysis 内部已经处理了错误，这里捕获是为了确保测试继续
        }

        // 错误处理器应该被调用至少一次
        assert.ok(
            handledErrors >= 1,
            `Expected error handler to be called at least once, but was called ${handledErrors} times`
        );
    } finally {
        // Restore original methods
        vscode.workspace.fs.readFile = originalReadFile;
        vscode.workspace.fs.stat = originalStat;
    }
}

describe('diagnostics-di-injection', () => {
    it('should inject custom error handler', async () => {
        await run();
    });
});

if (require.main === module) {
    run().catch((err) => {
        console.error('❌ Diagnostics DI injection test failed:', err);
        process.exit(1);
    });
}