"use strict";

const assert = require("assert");

// Mock VSCode API with overridable configuration
const {createVscodeMock, installVscodeMock} = require('../../test-helpers/vscode-mock');
const vscode = createVscodeMock({
    workspace: {
        getConfiguration: (section) => {
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
                        return defaults[key];
                    },
                };
            } else if (section === "thrift-support.formatting") {
                // legacy namespace used by some tests
                return {get: (key, def) => def};
            }
            return {get: () => undefined};
        },
    },
    TextEdit: {replace: (range, newText) => ({range, newText})},
    Range: class {
        constructor(start, end) {
            this.start = start;
            this.end = end;
        }
    },
    Position: class {
        constructor(line, character) {
            this.line = line;
            this.character = character;
        }
    },
});
installVscodeMock(vscode);


// Patch module loading to inject our mock vscode
const {ThriftFormattingProvider} = require('../../../out/src/formattingProvider.js');

class MockDocument {
    constructor(text) {
        this._text = text;
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

function test_struct_annotations_align_all_on() {
    const input = buildInputWithVariants();
    const out = runRangeFormat(input, 1, 5);
    const lines = out.split("\n");
    const l1 = lines[0];
    const l2 = lines[1];
    const l4 = lines[3]; // line with annotation and comment

    // Annotation start positions should align across all annotated fields
    const ann1 = l1.indexOf(" (");
    const ann2 = l2.indexOf(" (");
    const ann4 = l4.indexOf(" (");
    assert.ok(ann1 > 0 && ann2 > 0 && ann4 > 0, "annotations should exist");
    assert.strictEqual(ann1, ann2, "annotation columns should align (1 vs 2)");
    assert.strictEqual(ann1, ann4, "annotation columns should align (1 vs 4)");

    // Comments should also align taking into account max content width including annotations
    const c1 = l1.indexOf(" //");
    const c4 = l4.indexOf(" //");
    assert.ok(c1 > 0 && c4 > 0, "comments should exist where provided");
    assert.strictEqual(c1, c4, "comment columns should align");
}

function test_struct_annotations_align_no_type_no_name() {
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

        // Comments still align
        const c1 = l1.indexOf(" //");
        const c4 = l4.indexOf(" //");
        assert.strictEqual(c1, c4, "comment columns should still align");
    });
}

function test_struct_annotations_disabled() {
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
}

function test_struct_annotations_trailing_comma_add() {
    withConfig({trailingComma: "add"}, () => {
        const input = buildInputWithVariants();
        const out = runRangeFormat(input, 1, 5);
        const lines = out.split("\n");

        // All non-terminated lines should end with a comma
        for (const ln of lines) {
            if (!ln.trim().startsWith("struct") && !ln.trim().startsWith("}")) {
                assert.ok(/,\s*$/.test(ln), "line should end with a trailing comma when add mode is on");
            }
        }

        // Annotation columns remain aligned
        const l1 = lines[0];
        const l2 = lines[1];
        const l4 = lines[3];
        const a1 = l1.indexOf(" (");
        const a2 = l2.indexOf(" (");
        const a4 = l4.indexOf(" (");
        assert.strictEqual(a1, a2);
        assert.strictEqual(a1, a4);
    });
}

function test_struct_annotations_with_semicolon_preserve() {
    // Include a field that already uses semicolon; trailingComma add/remove should respect it
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

        // First line contains a semicolon (preserved), and should not end with comma
        assert.ok(l1.includes(";"), "semicolon should be preserved");
        assert.ok(!/,\s*$/.test(l1), "semicolon line should not end with comma");
        // Second line should end with comma due to add
        assert.ok(/,\s*$/.test(l2), "second line should end with comma when add mode");

        // Annotation starts should align
        const a1 = l1.indexOf(" (");
        const a2 = l2.indexOf(" (");
        assert.strictEqual(a1, a2, "annotation columns should align with semicolon/comma mix");
    });
}

function test_struct_annotations_trailing_comma_remove_and_semicolon_preserve() {
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

        // First line keeps semicolon; no trailing comma added
        assert.ok(l1.includes(";"), "semicolon should be preserved in remove mode");
        assert.ok(!/,\s*$/.test(l1), "semicolon line should not end with comma in remove mode");

        // Second line comma should be removed by remove mode (comment exists after)
        assert.ok(!/,\s*\/\//.test(l2), "comma before comment should be removed in remove mode");

        // Annotation columns remain aligned under defaults
        const a1 = l1.indexOf(" (");
        const a2 = l2.indexOf(" (");
        assert.strictEqual(a1, a2, "annotation columns should align even with semicolon/comma differences");
    });
}

function test_struct_comment_alignment_only_comments_true() {
    // Only enable comment alignment; disable other alignments to observe its isolated effect
    withConfig({alignComments: true, alignAnnotations: false, alignTypes: false, alignFieldNames: false}, () => {
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
        // With alignComments=true, these should be aligned even though other alignments are disabled
        assert.strictEqual(c1, c2, "comment columns should align when alignComments=true");
        assert.strictEqual(c1, c3, "comment columns should align when alignComments=true");
    });
}

function test_struct_comments_not_aligned_when_disabled() {
    // Disable other alignments that might equalize base widths
    withConfig({alignComments: false, alignAnnotations: false, alignTypes: false, alignFieldNames: false}, () => {
        const input = buildInputWithVariants();
        const out = runRangeFormat(input, 1, 5);
        const lines = out.split("\n");
        const l1 = lines[0];
        const l4 = lines[3];

        const c1 = l1.indexOf(" //");
        const c4 = l4.indexOf(" //");
        if (c1 > 0 && c4 > 0) {
            const assert = require("assert");
            // With alignComments disabled and also annotation alignment off, comment columns should not be equal
            assert.notStrictEqual(c1, c4, "comment columns should not align when all comment-related alignments are disabled");
        }
    });
}

(function main() {
    try {
        console.log("[test-struct-annotations-combinations] Running tests...");
        test_struct_annotations_align_all_on();
        console.log("  ✓ struct annotations aligned with all defaults");
        test_struct_annotations_align_no_type_no_name();
        console.log("  ✓ struct annotations aligned without type/name alignment");
        test_struct_annotations_disabled();
        console.log("  ✓ struct annotations not aligned when disabled");
        test_struct_annotations_trailing_comma_add();
        console.log("  ✓ struct annotations alignment stable with trailingComma=add");
        test_struct_annotations_with_semicolon_preserve();
        console.log("  ✓ semicolon preserved and annotations aligned");
        test_struct_comments_not_aligned_when_disabled();
        console.log("  ✓ comments not aligned when alignComments=false");
        test_struct_annotations_trailing_comma_remove_and_semicolon_preserve();
        console.log("  ✓ trailingComma=remove removes commas and preserves semicolons");
        test_struct_comment_alignment_only_comments_true();
        console.log("  ✓ comments align when only alignComments=true");
        console.log("All tests passed.");
    } catch (e) {
        console.error("Test failed:", e);
        process.exit(1);
    }
})();
