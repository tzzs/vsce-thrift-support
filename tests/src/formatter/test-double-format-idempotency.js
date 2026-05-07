"use strict";

const assert = require("assert");
const vscode = require('vscode');
const {ThriftFormattingProvider} = require('../../../out/formatting-bridge/index.js');

function makeDoc(text, filePath) {
    return {
        uri: vscode.Uri.file(filePath),
        getText: (range) => {
            if (!range) return text;
            const lines = text.split('\n');
            const startOff = lines.slice(0, range.start.line).reduce((s, l) => s + l.length + 1, 0);
            const endOff = lines.slice(0, range.end.line).reduce((s, l) => s + l.length + 1, 0);
            return text.slice(startOff + range.start.character, endOff + range.end.character);
        },
        lineAt: (line) => ({ text: text.split('\n')[line] || '' }),
        lineCount: text.split('\n').length,
        positionAt: (offset) => {
            const lines = text.split('\n');
            let cur = 0;
            for (let i = 0; i < lines.length; i++) {
                if (cur + lines[i].length + 1 > offset) return new vscode.Position(i, offset - cur);
                cur += lines[i].length + 1;
            }
            return new vscode.Position(lines.length - 1, 0);
        }
    };
}

function setupConfig() {
    const orig = vscode.workspace.getConfiguration;
    vscode.workspace.getConfiguration = (section) => {
        if (section === 'thrift.format') {
            return { get: (key, def) => {
                const d = { trailingComma: 'preserve', alignTypes: true, alignFieldNames: true,
                    alignComments: true, indentSize: 4, maxLineLength: 100, collectionStyle: 'preserve' };
                return key in d ? d[key] : def;
            }};
        }
        if (section === 'thrift-support.formatting') return { get: (k, d) => d };
        return { get: () => undefined };
    };
    return orig;
}

describe('double-format-idempotency', () => {
    let origConfig;
    beforeEach(() => { origConfig = setupConfig(); });
    afterEach(() => { vscode.workspace.getConfiguration = origConfig; });

    const token = { isCancellationRequested: false, onCancellationRequested: () => ({ dispose: () => {} }) };
    const fmtOpts = { insertSpaces: true, tabSize: 4 };

    it('flat exception - format twice via bridge full doc', () => {
        const input = [
            "exception Xception2 {",
            "    1: i32    errorCode   , /// 12312331",
            "    2: Xtruct struct_thing  // 1211",
            "}"
        ].join("\n");

        const provider = new ThriftFormattingProvider();

        const doc1 = makeDoc(input, '/test/flat1.thrift');
        const p1 = provider.provideDocumentFormattingEdits(doc1, fmtOpts, token)[0].newText;

        const doc2 = makeDoc(p1, '/test/flat1.thrift');
        const p2 = provider.provideDocumentFormattingEdits(doc2, fmtOpts, token)[0].newText;

        const doc3 = makeDoc(p2, '/test/flat1.thrift');
        const p3 = provider.provideDocumentFormattingEdits(doc3, fmtOpts, token)[0].newText;

        console.log('\nPass 1:');
        console.log(p1);
        console.log('Pass 2:');
        console.log(p2);

        // Verify correct indentation
        const lines = p1.split('\n');
        for (let i = 1; i <= 2; i++) {
            const indent = (lines[i] || '').match(/^(\s*)/)[1].length;
            assert.strictEqual(indent, 4, `Field line ${i} should have 4-space indent, got ${indent}`);
        }

        assert.strictEqual(p1, p2, 'Pass 1 == Pass 2');
        assert.strictEqual(p2, p3, 'Pass 2 == Pass 3');
    });

    it('union with aligned commas - format twice', () => {
        const input = [
            "union SomeUnion {",
            "    1: map<Numberz,UserId> map_thing     ,",
            "    2: string              string_thing  ,",
            "    3: i32                 i32_thing     ,",
            "    4: Xtruct3             xtruct_thing  ,",
            "    5: Insanity            insanity_thing",
            "}"
        ].join("\n");

        const provider = new ThriftFormattingProvider();

        const doc1 = makeDoc(input, '/test/union1.thrift');
        const p1 = provider.provideDocumentFormattingEdits(doc1, fmtOpts, token)[0].newText;

        const doc2 = makeDoc(p1, '/test/union1.thrift');
        const p2 = provider.provideDocumentFormattingEdits(doc2, fmtOpts, token)[0].newText;

        console.log('\nUnion Pass 1:');
        console.log(p1);
        console.log('Union Pass 2:');
        console.log(p2);

        // Verify commas follow content (no trailing spaces before comma)
        const p1Lines = p1.split('\n');
        for (let i = 1; i <= 4; i++) {
            const line = p1Lines[i] || '';
            assert.ok(!/  ,/.test(line), `Line ${i} should not have spaces before comma: "${line}"`);
            const indent = (line.match(/^(\s*)/) || [''])[1].length;
            assert.strictEqual(indent, 4, `Line ${i} should have 4-space indent, got ${indent}`);
        }

        assert.strictEqual(p1, p2, 'Union format idempotent');
    });

    it('struct with no comments - idempotent', () => {
        const input = [
            "struct Foo {",
            "    1: string name,",
            "    2: i32 age",
            "}"
        ].join("\n");

        const provider = new ThriftFormattingProvider();

        const doc1 = makeDoc(input, '/test/nocomment.thrift');
        const p1 = provider.provideDocumentFormattingEdits(doc1, fmtOpts, token)[0].newText;

        const doc2 = makeDoc(p1, '/test/nocomment.thrift');
        const p2 = provider.provideDocumentFormattingEdits(doc2, fmtOpts, token)[0].newText;

        assert.strictEqual(p1, p2, 'Simple struct idempotent');
    });
});
