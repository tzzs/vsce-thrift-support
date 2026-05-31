const assert = require('assert');
const vscode = require('vscode');

const {DiagnosticManager} = require('../../../out/diagnostics');
const {ThriftParser} = require('../../../out/ast/parser.js');
const {config} = require('../../../out/config/index.js');

function createDocument(text, version = 1) {
    const lines = text.split('\n');
    const uri = vscode.Uri.file('/tmp/incremental-fallback.thrift');
    return {
        languageId: 'thrift',
        uri,
        version,
        getText: () => text,
        lineAt: (line) => ({text: lines[line] || ''})
    };
}

describe('diagnostics incremental parse fallback', () => {
    let originalCreateDiagnosticCollection;
    let originalParseContentWithCache;
    let originalAnalysisEnabled;
    let originalMaxDirtyLines;

    beforeEach(() => {
        originalCreateDiagnosticCollection = vscode.languages.createDiagnosticCollection;
        originalParseContentWithCache = ThriftParser.parseContentWithCache;
        originalAnalysisEnabled = config.incremental.analysisEnabled;
        originalMaxDirtyLines = config.incremental.maxDirtyLines;
    });

    afterEach(() => {
        vscode.languages.createDiagnosticCollection = originalCreateDiagnosticCollection;
        ThriftParser.parseContentWithCache = originalParseContentWithCache;
        config.incremental.analysisEnabled = originalAnalysisEnabled;
        config.incremental.maxDirtyLines = originalMaxDirtyLines;
    });

    it('falls back to full analysis when partial AST parsing fails', async () => {
        let setCount = 0;
        vscode.languages.createDiagnosticCollection = () => ({
            set: () => {
                setCount += 1;
            },
            clear: () => {},
            delete: () => {},
            dispose: () => {}
        });

        config.incremental.analysisEnabled = true;
        config.incremental.maxDirtyLines = 10;

        const initialText = [
            'struct User {',
            '  1: string name,',
            '}'
        ].join('\n');
        const manager = new DiagnosticManager();
        const initialDoc = createDocument(initialText, 1);
        await manager.performAnalysis(initialDoc);
        assert.strictEqual(setCount, 1, 'Initial full analysis should publish diagnostics');

        const key = initialDoc.uri.toString();
        const state = manager.documentStates.get(key);
        assert.ok(state && state.lastAst, 'Initial analysis should cache AST state');
        Object.assign(state, {
            version: 2,
            useIncrementalDiagnostics: true,
            useCachedIncludes: true,
            dirtyRange: {startLine: 1, endLine: 1},
            dirtyRanges: [{startLine: 1, endLine: 1}]
        });
        manager.documentStates.set(key, state);

        ThriftParser.parseContentWithCache = (uri, text) => {
            if (String(uri).includes('#partial:')) {
                throw new Error('partial parse failed');
            }
            return originalParseContentWithCache.call(ThriftParser, uri, text);
        };

        const updatedDoc = createDocument(initialText.replace('name', 'displayName'), 2);
        await manager.performAnalysis(updatedDoc);

        assert.strictEqual(setCount, 2, 'Fallback full analysis should still publish diagnostics');
    });
});
