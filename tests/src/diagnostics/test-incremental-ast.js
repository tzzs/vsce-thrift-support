const assert = require('assert');

const {DiagnosticManager} = require('../../../out/diagnostics');
const {config} = require('../../../out/config/index.js');
const nodes = require('../../../out/ast/nodes.types.js');

describe('incremental-ast', () => {
    let originalAnalysisEnabled;
    let originalMaxDirty;

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

    it('should patch AST incrementally', async () => {
        config.incremental.analysisEnabled = true;
        config.incremental.maxDirtyLines = 5;

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
        manager.scheduleAnalysis(updatedDoc, true, false, 'documentChange', 1, false, {
            startLine: 2,
            endLine: 2
        }, false);
        await manager.performAnalysis(updatedDoc);

        const state = manager.documentStates.get(updatedDoc.uri.toString());
        assert.ok(state, 'Should have diagnostic state after analysis');
        assert.ok(state.lastAst, 'Should have cached AST');

        const structNode = state.lastAst.body.find((node) =>
            node.type === nodes.ThriftNodeType.Struct && node.name === 'Person'
        );
        assert.ok(structNode, 'Should have struct node after incremental patch');

        const nameField = structNode.fields.find((field) => field.id === 2);
        assert.ok(nameField, 'Should have second field');
        assert.strictEqual(nameField.fieldType, 'i64', 'Should update field type incrementally');

        const blockKey = structNode
            ? `${structNode.range.start.line}-${structNode.range.end.line}`
            : '0-0';
        assert.ok(state.blockAstCache?.has(blockKey), 'Should update subtree cache');
    });
});