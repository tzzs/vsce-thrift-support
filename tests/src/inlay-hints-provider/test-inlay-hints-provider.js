require('../../require-hook');
const assert = require('assert');
const vscode = require('vscode');
const {ThriftInlayHintsProvider} = require('../../../out/inlay-hints-provider.js');

function createDoc(text, fsPath = '/workspace/main.thrift') {
    const lines = text.split('\n');
    return {
        uri: vscode.Uri.file(fsPath),
        languageId: 'thrift',
        version: 1,
        getText: () => text,
        lineAt: (line) => ({text: lines[line] || ''}),
        lineCount: lines.length
    };
}

function withInlayConfig(values) {
    vscode.workspace.getConfiguration = (section) => ({
        get: (key, defaultValue) => {
            if (section === 'thrift.inlayHints' && Object.prototype.hasOwnProperty.call(values, key)) {
                return values[key];
            }
            return defaultValue;
        }
    });
}

function createWorkspaceIndex(files) {
    const docs = files.map(file => createDoc(file.text, file.path));
    return {
        getAllFiles: () => docs.map(doc => doc.uri),
        getText: async (uri) => {
            const doc = docs.find(candidate => candidate.uri.toString() === uri.toString());
            if (!doc) {
                throw new Error(`missing doc ${uri.toString()}`);
            }
            return doc.getText();
        }
    };
}

describe('inlay hints provider', () => {
    let originalGetConfiguration;

    beforeEach(() => {
        originalGetConfiguration = vscode.workspace.getConfiguration;
    });

    afterEach(() => {
        vscode.workspace.getConfiguration = originalGetConfiguration;
    });

    it('keeps requiredness hints disabled by default', async () => {
        const doc = createDoc('struct User {\n  1: i32 id\n}');
        const provider = new ThriftInlayHintsProvider();

        const hints = await provider.provideInlayHints(
            doc,
            new vscode.Range(0, 0, 10, 0),
            {isCancellationRequested: false}
        );

        assert.deepStrictEqual(hints, []);
    });

    it('shows default requiredness only for implicit fields when enabled', async () => {
        withInlayConfig({requiredness: true});
        const doc = createDoc([
            'struct User {',
            '  1: i32 id',
            '  2: optional string name',
            '}'
        ].join('\n'));
        const provider = new ThriftInlayHintsProvider();

        const hints = await provider.provideInlayHints(
            doc,
            new vscode.Range(0, 0, 10, 0),
            {isCancellationRequested: false}
        );

        assert.strictEqual(hints.length, 1);
        assert.strictEqual(hints[0].label, 'default');
        assert.strictEqual(hints[0].position.line, 1);
    });

    it('shows service override hints across indexed workspace files', async () => {
        withInlayConfig({serviceOverrides: true});
        const files = [
            {
                path: '/workspace/base.thrift',
                text: 'service Base {\n  void ping()\n}'
            },
            {
                path: '/workspace/main.thrift',
                text: 'include "base.thrift"\nservice Child extends Base {\n  void ping()\n}'
            }
        ];
        const doc = createDoc(files[1].text, files[1].path);
        const provider = new ThriftInlayHintsProvider({workspaceIndex: createWorkspaceIndex(files)});

        const hints = await provider.provideInlayHints(
            doc,
            new vscode.Range(0, 0, 10, 0),
            {isCancellationRequested: false}
        );

        assert.ok(hints.some(hint => hint.label === 'overrides Base'));
    });

    it('shows include alias hints for direct cross-file type references when enabled', async () => {
        withInlayConfig({includeAliases: true, serviceOverrides: false});
        const files = [
            {
                path: '/workspace/shared.thrift',
                text: 'struct Profile {\n  1: string name\n}'
            },
            {
                path: '/workspace/main.thrift',
                text: 'include "shared.thrift"\nstruct User {\n  1: Profile profile\n}'
            }
        ];
        const doc = createDoc(files[1].text, files[1].path);
        const provider = new ThriftInlayHintsProvider({workspaceIndex: createWorkspaceIndex(files)});

        const hints = await provider.provideInlayHints(
            doc,
            new vscode.Range(0, 0, 10, 0),
            {isCancellationRequested: false}
        );

        assert.ok(hints.some(hint => hint.label === 'from shared'));
    });
});
