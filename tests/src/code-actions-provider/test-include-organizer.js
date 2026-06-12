require('../../require-hook');
const assert = require('assert');
const vscode = require('vscode');
const {
    buildOrganizeIncludesEdit,
    buildRemoveUnusedIncludesEdit
} = require('../../../out/include-organizer.js');

function createDoc(text) {
    const lines = text.split('\n');
    return {
        uri: vscode.Uri.file('/workspace/main.thrift'),
        languageId: 'thrift',
        getText: () => text,
        lineCount: lines.length,
        lineAt: (line) => ({text: lines[line] || ''})
    };
}

describe('include organizer', () => {
    it('sorts include lines inside include blocks while preserving comments', () => {
        const doc = createDoc([
            'namespace * example',
            '',
            '// shared models',
            'include "z.thrift"',
            'include "a.thrift"',
            '',
            'struct User {',
            '}'
        ].join('\n'));

        const edit = buildOrganizeIncludesEdit(doc);
        assert.ok(edit, 'expected organize includes edit');
        assert.strictEqual(edit.newText, [
            'namespace * example',
            '',
            '// shared models',
            'include "a.thrift"',
            'include "z.thrift"',
            '',
            'struct User {',
            '}'
        ].join('\n'));
    });

    it('removes unused includes based on namespace alias references', () => {
        const doc = createDoc([
            'include "used.thrift"',
            'include "unused.thrift"',
            '',
            'struct User {',
            '  1: used.Profile profile,',
            '}'
        ].join('\n'));

        const edit = buildRemoveUnusedIncludesEdit(doc);
        assert.ok(edit, 'expected remove unused includes edit');
        assert.strictEqual(edit.newText, [
            'include "used.thrift"',
            '',
            'struct User {',
            '  1: used.Profile profile,',
            '}'
        ].join('\n'));
    });
});
