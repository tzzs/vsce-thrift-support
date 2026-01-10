"use strict";

const assert = require("assert");
const {ThriftFormattingProvider} = require('../../../out/formatting-bridge/index.js');
const vscode = require('vscode');

class MockDocument {
    constructor(text) {
        this._text = text;
        const vscode = require('vscode');
        this.uri = vscode.Uri.file('/test/mock.thrift');
    }

    getText(range) {
        if (!range) return this._text;
        const lines = this._text.split("\n");
        const startOffset = lines.slice(0, range.start.line).reduce((sum, line) => sum + line.length + 1, 0);
        const endOffset = lines.slice(0, range.end.line).reduce((sum, line) => sum + line.length + 1, 0);
        return this._text.slice(startOffset + range.start.character, endOffset + range.end.character);
    }

    positionAt(offset) {
        const lines = this._text.slice(0, offset).split("\n");
        const line = lines.length - 1;
        const character = lines[lines.length - 1].length;
        return {line, character};
    }
}

function makeRange(startLine, startChar, endLine, endChar) {
    return {start: {line: startLine, character: startChar}, end: {line: endLine, character: endChar}};
}

function runRangeFormat(input, startLine, endLine) {
    const doc = new MockDocument(input);
    const provider = new ThriftFormattingProvider();
    const range = makeRange(startLine, 0, endLine, 9999);
    const edits = provider.provideDocumentRangeFormattingEdits(doc, range, {insertSpaces: true, tabSize: 4});
    const out = edits[0].newText;
    return out;
}

function withConfig(overrides, fn) {
    const originalGetConfiguration = vscode.workspace.getConfiguration;
    vscode.workspace.getConfiguration = (section) => {
        if (section === "thrift.format") {
            return {
                get: (key) => {
                    const defaults = {
                        trailingComma: "preserve",
                        alignTypes: true,
                        alignFieldNames: true,
                        alignAnnotations: true,
                        alignComments: true,
                        alignEnumNames: true,
                        alignEnumEquals: true,
                        alignEnumValues: true,
                        indentSize: 4,
                        maxLineLength: 100,
                        collectionStyle: "preserve",
                    };
                    return key in overrides ? overrides[key] : defaults[key];
                },
            };
        } else if (section === "thrift-support.formatting") {
            return {get: (key, def) => def};
        }
        return {get: () => undefined};
    };

    try {
        fn();
    } finally {
        vscode.workspace.getConfiguration = originalGetConfiguration;
    }
}

function buildInputWithVariants() {
    return [
        "struct S {",
        "    1: required string a = \"\" (anno.one='x') // c1",
        "    2: optional map<i32, list<string>> bb (anno.two='y')",
        "    3: optional i64 c // no anno",
        "    4: required double d = 1.0 (long.tag='abcde') // c4",
        "}",
    ].join("\n");
}

describe('struct-annotations-combinations', () => {
    it('should align annotations when all alignment options are enabled', () => {
        const input = buildInputWithVariants();
        const out = runRangeFormat(input, 1, 5);
        const lines = out.split("\n");
        const l1 = lines[0];
        const l2 = lines[1];
        const l4 = lines[3];

        const ann1 = l1.indexOf(" (");
        const ann2 = l2.indexOf(" (");
        const ann4 = l4.indexOf(" (");
        assert.ok(ann1 > 0 && ann2 > 0 && ann4 > 0, "annotations should exist");
        assert.strictEqual(ann1, ann2, "annotation columns should align (1 vs 2)");
        assert.strictEqual(ann1, ann4, "annotation columns should align (1 vs 4)");

        const c1 = l1.indexOf(" //");
        const c4 = l4.indexOf(" //");
        assert.ok(c1 > 0 && c4 > 0, "comments should exist where provided");
        assert.strictEqual(c1, c4, "comment columns should align");
    });

    it('should align annotations without type and name alignment', () => {
        withConfig({alignTypes: false, alignFieldNames: false}, () => {
            const input = buildInputWithVariants();
            const out = runRangeFormat(input, 1, 5);
            const lines = out.split("\n");
            const l1 = lines[0];
            const l2 = lines[1];
            const l4 = lines[3];

            const ann1 = l1.indexOf(" (");
            const ann2 = l2.indexOf(" (");
            const ann4 = l4.indexOf(" (");
            assert.ok(ann1 > 0 && ann2 > 0 && ann4 > 0, "annotations should exist");
            assert.strictEqual(ann1, ann2, "annotation columns should align without type/name alignment");
            assert.strictEqual(ann1, ann4, "annotation columns should align without type/name alignment");

            const c1 = l1.indexOf(" //");
            const c4 = l4.indexOf(" //");
            assert.strictEqual(c1, c4, "comment columns should still align");
        });
    });

    it('should not align annotations when alignment is disabled', () => {
        withConfig({alignAnnotations: false}, () => {
            const input = buildInputWithVariants();
            const out = runRangeFormat(input, 1, 5);
            const lines = out.split("\n");
            const l1 = lines[0];
            const l2 = lines[1];

            const ann1 = l1.indexOf(" (");
            const ann2 = l2.indexOf(" (");
            assert.ok(ann1 > 0 && ann2 > 0, "annotations should exist");
            assert.notStrictEqual(ann1, ann2, "annotation columns should not align when disabled");
        });
    });

    it('should add trailing commas and align annotations', () => {
        withConfig({trailingComma: "add"}, () => {
            const input = buildInputWithVariants();
            const out = runRangeFormat(input, 1, 5);
            const lines = out.split("\n");

            for (const ln of lines) {
                if (!ln.trim().startsWith("struct") && !ln.trim().startsWith("}")) {
                    assert.ok(/,\s*$/.test(ln), "line should end with a trailing comma when add mode is on");
                }
            }

            const l1 = lines[0];
            const l2 = lines[1];
            const l4 = lines[3];
            const a1 = l1.indexOf(" (");
            const a2 = l2.indexOf(" (");
            const a4 = l4.indexOf(" (");
            assert.strictEqual(a1, a2);
            assert.strictEqual(a1, a4);
        });
    });

    it('should preserve semicolons when adding trailing commas', () => {
        const input = [
            "struct S2 {",
            "    1: required string a = \"\" (anno='x'); // c",
            "    2: required string b (anno='y')",
            "}",
        ].join("\n");

        withConfig({trailingComma: "add"}, () => {
            const out = runRangeFormat(input, 1, 3);
            const lines = out.split("\n");
            const l1 = lines[0];
            const l2 = lines[1];

            assert.ok(l1.includes(";"), "semicolon should be preserved");
            assert.ok(!/,\s*$/.test(l1), "semicolon line should not end with comma");
            assert.ok(/,\s*$/.test(l2), "second line should end with comma when add mode");

            const a1 = l1.indexOf(" (");
            const a2 = l2.indexOf(" (");
            assert.strictEqual(a1, a2, "annotation columns should align with semicolon/comma mix");
        });
    });

    it('should preserve semicolons when removing trailing commas', () => {
        const input = [
            "struct S3 {",
            "    1: required string a = \"\" (anno='x'); // has semicolon",
            "    2: required string b (anno='y'), // has comma",
            "}",
        ].join("\n");

        withConfig({trailingComma: "remove"}, () => {
            const out = runRangeFormat(input, 1, 3);
            const lines = out.split("\n");
            const l1 = lines[0];
            const l2 = lines[1];

            assert.ok(l1.includes(";"), "semicolon should be preserved in remove mode");
            assert.ok(!/,\s*$/.test(l1), "semicolon line should not end with comma in remove mode");
            assert.ok(!/,\s*\/\//.test(l2), "comma before comment should be removed in remove mode");

            const a1 = l1.indexOf(" (");
            const a2 = l2.indexOf(" (");
            assert.strictEqual(a1, a2, "annotation columns should align even with semicolon/comma differences");
        });
    });

    it('should align comments when only comment alignment is enabled', () => {
        withConfig({
            alignComments: true,
            alignAnnotations: false,
            alignTypes: false,
            alignFieldNames: false
        }, () => {
            const input = [
                "struct S4 {",
                "    1: required string a (anno='x') // first",
                "    2: i64 bbbbbbbbbbbbbbbbbbbbbbbbb // second long name",
                "    3: string c // third",
                "}",
            ].join("\n");

            const out = runRangeFormat(input, 1, 4);
            const lines = out.split("\n");
            const l1 = lines[0];
            const l2 = lines[1];
            const l3 = lines[2];

            const c1 = l1.indexOf(" //");
            const c2 = l2.indexOf(" //");
            const c3 = l3.indexOf(" //");
            assert.ok(c1 > 0 && c2 > 0 && c3 > 0, "comments should exist");
            assert.strictEqual(c1, c2, "comment columns should align when alignComments=true");
            assert.strictEqual(c1, c3, "comment columns should align when alignComments=true");
        });
    });

    it('should not align comments when comment alignment is disabled', () => {
        withConfig({
            alignComments: false,
            alignAnnotations: false,
            alignTypes: false,
            alignFieldNames: false
        }, () => {
            const input = buildInputWithVariants();
            const out = runRangeFormat(input, 1, 5);
            const lines = out.split("\n");
            const l1 = lines[0];
            const l4 = lines[3];

            const c1 = l1.indexOf(" //");
            const c4 = l4.indexOf(" //");
            if (c1 > 0 && c4 > 0) {
                assert.notStrictEqual(c1, c4, "comment columns should not align when all comment-related alignments are disabled");
            }
        });
    });
});
