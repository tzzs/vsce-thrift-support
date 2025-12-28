"use strict";

const assert = require("assert");

// Mock VSCode API with overridable configuration
const {createVscodeMock, installVscodeMock} = require('../../mock_vscode.js');
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

function test_enum_alignments_basic() {
    const input = [
        "enum E {",
        "    ACTIVE = 1, // a",
        "    INACTIVE = 10, // bb",
        "    UNKNOWN = 100 // c",
        "}",
    ].join("\n");
    const out = runRangeFormat(input, 1, 4);
    const lines = out.split("\n");

    const l1 = lines[0];
    const l2 = lines[1];
    const l3 = lines[2];

    // Verify name alignment: '=' positions equal when alignEnumEquals is true
    const e1 = l1.indexOf(" = ");
    const e2 = l2.indexOf(" = ");
    const e3 = l3.indexOf(" = ");
    assert.strictEqual(e1, e2);
    assert.strictEqual(e1, e3);

    // Verify comments alignment when alignComments is true
    const c1 = l1.indexOf(" //");
    const c2 = l2.indexOf(" //");
    const c3 = l3.indexOf(" //");
    assert.strictEqual(c1, c2);
    assert.strictEqual(c1, c3);
}

function test_enum_alignments_values_and_comments() {
    withConfig({alignEnumValues: true}, () => {
        const input = [
            "enum E2 {",
            "    A = 1, // a",
            "    B = 1000, // bb",
            "    C = 20 // c",
            "}",
        ].join("\n");
        const out = runRangeFormat(input, 1, 4);
        const lines = out.split("\n");

        // '=' should still align
        const e1 = lines[0].indexOf(" = ");
        const e2 = lines[1].indexOf(" = ");
        const e3 = lines[2].indexOf(" = ");
        assert.strictEqual(e1, e2);
        assert.strictEqual(e1, e3);

        // Comments align regardless of numeric width after padding values
        const c1 = lines[0].indexOf(" //");
        const c2 = lines[1].indexOf(" //");
        const c3 = lines[2].indexOf(" //");
        assert.strictEqual(c1, c2);
        assert.strictEqual(c1, c3);
    });
}

function test_enum_trailing_comma_modes() {
    // One line uses semicolon; add/remove should respect it per implementation
    const input = [
        "enum E3 {",
        "    A = 1; // a",
        "    B = 2, // bb",
        "    C = 3 // c",
        "}",
    ].join("\n");

    // add: lines without semicolon should end with comma
    withConfig({trailingComma: "add"}, () => {
        const out = runRangeFormat(input, 1, 4);
        const lines = out.split("\n");
        assert.ok(/;\s*$/.test(lines[0]));
        assert.ok(/,\s*$/.test(lines[1]));
        assert.ok(/,\s*$/.test(lines[2]));
    });

    // remove: commas removed where not semicolon
    withConfig({trailingComma: "remove"}, () => {
        const out = runRangeFormat(input, 1, 4);
        const lines = out.split("\n");
        assert.ok(/;\s*$/.test(lines[0]));
        assert.ok(!/,\s*$/.test(lines[1]));
        assert.ok(!/,\s*$/.test(lines[2]));
    });
}

(function main() {
    try {
        console.log("[test-enum-annotations-combinations] Running tests...");
        test_enum_alignments_basic();
        console.log("  \u2713 enum name/equals/comments aligned");
        test_enum_alignments_values_and_comments();
        console.log("  \u2713 enum values padded and comments aligned");
        test_enum_trailing_comma_modes();
        console.log("  \u2713 enum trailing comma modes respected");
        console.log("All tests passed.");
    } catch (e) {
        console.error("Test failed:", e);
        process.exit(1);
    }
})();
