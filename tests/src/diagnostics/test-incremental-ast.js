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

const {DiagnosticManager} = require('../../../out/diagnostics');
const {config} = require('../../../out/config/index.js');
const nodes = require('../../../out/ast/nodes.types.js');

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
    console.log('\nRunning incremental AST patching test...');

    const originalAnalysisEnabled = config.incremental.analysisEnabled;
    const originalMaxDirty = config.incremental.maxDirtyLines;
    config.incremental.analysisEnabled = true;
    config.incremental.maxDirtyLines = 5;

    try {
        const manager = new DiagnosticManager();
        const baseText = [
            'struct Person {',
            '  1: i32 id,',
            '  2: string name,',
            '}'
        ].join('\n');

        const doc = createDoc(baseText, 'incremental-ast.thrift', 1);
        await manager.performAnalysis(doc);

        const updatedText = [
            'struct Person {',
            '  1: i32 id,',
            '  2: i64 name,',
            '}'
        ].join('\n');

        const updatedDoc = createDoc(updatedText, 'incremental-ast.thrift', 2);
        manager.scheduleAnalysis(updatedDoc, true, false, 'documentChange', 1, false, { startLine: 2, endLine: 2 }, false);
        await manager.performAnalysis(updatedDoc);

        const state = manager.documentStates.get(updatedDoc.uri.toString());
        assert.ok(state, 'Expected diagnostic state to exist after analysis');
        assert.ok(state.lastAst, 'Expected AST to be cached');
        const structNode = state.lastAst.body.find((node) =>
            node.type === nodes.ThriftNodeType.Struct && node.name === 'Person'
        );
        assert.ok(structNode, 'Expected struct node to survive incremental patch');
        const nameField = structNode.fields.find((field) => field.id === 2);
        assert.ok(nameField, 'Expected second field to exist');
        assert.strictEqual(nameField.fieldType, 'i64', 'Expected incremental AST to update the field type');

        const blockKey = structNode
            ? `${structNode.range.start.line}-${structNode.range.end.line}`
            : '0-0';
        assert.ok(state.blockAstCache?.has(blockKey), 'Expected subtree cache to record updated block');

        console.log('✅ Incremental AST cache test passed!');
    } finally {
        config.incremental.analysisEnabled = originalAnalysisEnabled;
        config.incremental.maxDirtyLines = originalMaxDirty;
    }
}

run();
