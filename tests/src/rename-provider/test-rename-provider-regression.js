const assert = require('assert');
const path = require('path');

const mockVscode = require('../../mock_vscode');
const {Range, Position} = mockVscode;

const {ThriftRenameProvider} = require('../../../out/rename-provider.js');

function createMockDocument(content, filePath) {
    const lines = content.split('\n');
    const lineStartOffsets = [];
    let acc = 0;
    for (let i = 0; i < lines.length; i++) {
        lineStartOffsets.push(acc);
        acc += lines[i].length + (i < lines.length - 1 ? 1 : 0);
    }

    const offsetAt = (pos) => lineStartOffsets[pos.line] + pos.character;

    return {
        uri: {fsPath: filePath},
        lineCount: lines.length,
        lineAt: (line) => ({text: lines[line] || ''}),
        getText: (range) => {
            if (!range) {
                return content;
            }
            const start = offsetAt(range.start);
            const end = offsetAt(range.end);
            return content.slice(start, end);
        },
        getWordRangeAtPosition: (position, regex) => {
            const line = lines[position.line] || '';
            const globalRegex = new RegExp(regex.source, 'g');
            let match;
            while ((match = globalRegex.exec(line)) !== null) {
                const start = match.index;
                const end = start + match[0].length;
                if (position.character >= start && position.character <= end) {
                    return new Range(new Position(position.line, start), new Position(position.line, end));
                }
            }
            return null;
        }
    };
}

function applyEditsToContent(content, edits) {
    if (!edits || edits.length === 0) return content;
    const lines = content.split('\n');
    const sorted = edits.slice().sort((a, b) => {
        if (a.range.start.line !== b.range.start.line) return b.range.start.line - a.range.start.line;
        return b.range.start.character - a.range.start.character;
    });
    for (const e of sorted) {
        const {start, end} = e.range;
        if (start.line === end.line) {
            const line = lines[start.line] || '';
            lines[start.line] = line.slice(0, start.character) + e.newText + line.slice(end.character);
        } else {
            const before = (lines[start.line] || '').slice(0, start.character);
            const after = (lines[end.line] || '').slice(end.character);
            lines.splice(start.line, end.line - start.line + 1, before + e.newText + after);
        }
    }
    return lines.join('\n');
}

function run() {

    const content = [
        'struct User {',
        '  1: i32 id,',
        '}',
        '',
        'service UserService {',
        '  User getUser(1: i32 id)',
        '}'
    ].join('\n');

    const filePath = path.join(__dirname, 'test-files', 'rename-regression.thrift');
    const doc = createMockDocument(content, filePath);

    mockVscode.workspace = {
        findFiles: async () => [],
        textDocuments: [doc],
        openTextDocument: async (uri) => {
            if (uri && uri.fsPath === filePath) {
                return doc;
            }
            throw new Error('Unexpected document request');
        }
    };

    const provider = new ThriftRenameProvider();
    const pos = new Position(0, 'struct '.length + 1); // inside User

    return Promise.resolve(provider.provideRenameEdits(doc, pos, 'Account')).then((we) => {
        assert.ok(we, 'Expected a WorkspaceEdit');
        const edits = we.edits || [];
        assert.ok(edits.length >= 2, 'Should update definition and reference');

        const newText = applyEditsToContent(content, edits);
        assert.ok(newText.includes('struct Account {'), 'Definition should be renamed without deleting the struct');
        assert.ok(newText.includes('service UserService {'), 'Service definition should remain intact');
        assert.ok(newText.includes('  1: i32 id,'), 'Struct body should remain intact');
        assert.ok(newText.includes('  Account getUser(1: i32 id)'), 'Reference should be renamed');

    });
}

describe('rename-provider-regression', () => {
    it('should pass all test assertions', async () => {
        await run();
    });

    it('does not rename a type when renaming a same-named field', async () => {
        const filePath = path.join(__dirname, 'test-files', 'field-type-collision.thrift');
        const content = [
            'struct User {',
            '  1: string name,',
            '}',
            '',
            'struct Container {',
            '  1: User User,',
            '}'
        ].join('\n');
        const doc = createMockDocument(content, filePath);
        doc.uri.toString = () => filePath;

        mockVscode.workspace = {
            findFiles: async () => [],
            textDocuments: [doc],
            openTextDocument: async (uri) => {
                if (uri && uri.fsPath === filePath) {
                    return doc;
                }
                throw new Error('Unexpected document request');
            }
        };

        const provider = new ThriftRenameProvider();
        const edit = await provider.provideRenameEdits(
            doc,
            new Position(5, 12), // On the field name "User", not the field type
            'owner',
            {isCancellationRequested: false}
        );

        assert.ok(edit, 'Expected a WorkspaceEdit');
        const newText = applyEditsToContent(content, edit.edits || []);

        assert.ok(newText.includes('struct User {'), 'Type declaration should remain unchanged');
        assert.ok(newText.includes('  1: User owner,'), 'Only the field name should be renamed');
        assert.strictEqual((newText.match(/\bowner\b/g) || []).length, 1, 'Only one field-name edit is expected');
    });

    it('passes injected dependencies into the references provider for cross-file rename edits', async () => {
        const sourcePath = path.join(__dirname, 'test-files', 'source.thrift');
        const targetPath = path.join(__dirname, 'test-files', 'target.thrift');
        const sourceText = [
            'struct User {',
            '  1: string name,',
            '}'
        ].join('\n');
        const targetText = [
            'include "source.thrift"',
            '',
            'struct Profile {',
            '  1: User owner,',
            '}'
        ].join('\n');
        const sourceDoc = createMockDocument(sourceText, sourcePath);
        const targetDoc = createMockDocument(targetText, targetPath);
        sourceDoc.uri.toString = () => sourcePath;
        targetDoc.uri.toString = () => targetPath;

        mockVscode.workspace = {
            findFiles: async () => [],
            textDocuments: [sourceDoc, targetDoc],
            openTextDocument: async (uri) => {
                if (uri && uri.fsPath === sourcePath) {
                    return sourceDoc;
                }
                if (uri && uri.fsPath === targetPath) {
                    return targetDoc;
                }
                throw new Error('Unexpected document request');
            }
        };

        const referencesModule = require('../../../out/references-provider.js');
        const renameProviderPath = require.resolve('../../../out/rename-provider.js');
        const originalProvider = referencesModule.ThriftReferencesProvider;
        const originalRenameModule = require.cache[renameProviderPath];
        const deps = {workspaceIndex: {marker: 'workspace-index'}};
        let capturedDeps;
        try {
            referencesModule.ThriftReferencesProvider = class {
                constructor(receivedDeps) {
                    capturedDeps = receivedDeps;
                }

                async provideReferences() {
                    return [
                        {
                            uri: sourceDoc.uri,
                            range: new Range(new Position(0, 7), new Position(0, 11))
                        },
                        {
                            uri: targetDoc.uri,
                            range: new Range(new Position(3, 5), new Position(3, 9))
                        }
                    ];
                }
            };
            delete require.cache[renameProviderPath];
            const {ThriftRenameProvider: FreshRenameProvider} = require('../../../out/rename-provider.js');
            const provider = new FreshRenameProvider(deps);
            const pos = new Position(0, 'struct '.length + 1);

            const edit = await provider.provideRenameEdits(
                sourceDoc,
                pos,
                'Account',
                {isCancellationRequested: false}
            );

            assert.strictEqual(capturedDeps, deps, 'Expected injected deps to reach ThriftReferencesProvider');
            assert.ok(edit, 'Expected a WorkspaceEdit');
            const targetEdits = (edit.edits || []).filter(e => e.uri.fsPath === targetPath);
            assert.ok(targetEdits.length > 0, 'Expected edits in the referencing file');
        } finally {
            referencesModule.ThriftReferencesProvider = originalProvider;
            delete require.cache[renameProviderPath];
            if (originalRenameModule) {
                require.cache[renameProviderPath] = originalRenameModule;
            }
        }
    });
});
