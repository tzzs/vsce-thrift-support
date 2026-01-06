"use strict";

const assert = require("assert");

// Mock VSCode API
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
                return {
                    get: (key, def) => def,
                };
            }
            return {get: () => undefined};
        },
    },
    TextEdit: {
        replace: (range, newText) => ({range, newText}),
    },
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
const {ThriftFormattingProvider} = require('../../../out/formatting-provider.js');

class MockDocument {
    constructor(text) {
        this._text = text;
    }

    getText(range) {
        if (!range) return this._text;
        const lines = this._text.split("\n");
        const startOffset = lines
            .slice(0, range.start.line)
            .reduce((sum, line) => sum + line.length + 1, 0);
        const endOffset = lines
            .slice(0, range.end.line)
            .reduce((sum, line) => sum + line.length + 1, 0);
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
    return {
        start: {line: startLine, character: startChar},
        end: {line: endLine, character: endChar},
    };
}

function runRangeFormat(input, startLine, endLine) {
    const doc = new MockDocument(input);
    const provider = new ThriftFormattingProvider();
    const range = makeRange(startLine, 0, endLine, 9999);
    const edits = provider.provideDocumentRangeFormattingEdits(
        doc,
        range,
        {insertSpaces: true, tabSize: 4}
    );
    const out = edits[0].newText;
    return out;
}

function testAlignAnnotationsEnabled() {
    const input = [
        "struct MainStruct {",
        "    1: required string sharedData = \"\" (go.tag='json:\"sharedData\"')",
        "    2: required i32    status                  (go.tag='json:\"status\"')",
        "    3: optional list<string> items = [] (custom.tag='x')",
        "}",
    ].join("\n");

    const out = runRangeFormat(input, 1, 4);
    const lines = out.split("\n");
    const l1 = lines[0];
    const l2 = lines[1];
    const l3 = lines[2];

    // Verify aligned type columns by checking the position of names
    const typeEnd1 = l1.indexOf(" sharedData");
    const typeEnd2 = l2.indexOf(" status");
    const typeEnd3 = l3.indexOf(" items");
    assert.strictEqual(typeEnd1, typeEnd2, "type columns should align");
    assert.strictEqual(typeEnd1, typeEnd3, "type columns should align");

    // Verify alignment of annotation start
    const annStart1 = l1.indexOf(" (go.tag");
    const annStart2 = l2.indexOf(" (go.tag");
    const annStart3 = l3.indexOf(" (custom.tag");
    assert.ok(annStart1 > 0 && annStart2 > 0 && annStart3 > 0, "annotations should exist");
    assert.strictEqual(annStart1, annStart2, "annotation columns should align");
    assert.strictEqual(annStart1, annStart3, "annotation columns should align");
}

function testAlignAnnotationsDisabled() {
    // Override config to disable annotations alignment
    const originalGetConfiguration = vscode.workspace.getConfiguration;
    vscode.workspace.getConfiguration = (section) => {
        if (section === "thrift.format") {
            return {
                get: (key) => {
                    const overrides = {
                        trailingComma: "preserve",
                        alignTypes: true,
                        alignFieldNames: true,

                        alignAnnotations: false,
                        alignComments: true,
                        alignEnumNames: true,
                        alignEnumEquals: true,
                        alignEnumValues: true,
                        indentSize: 4,
                        maxLineLength: 100,
                        collectionStyle: "preserve",
                    };
                    return overrides[key];
                },
            };
        } else if (section === "thrift-support.formatting") {
            return {get: (key, def) => def};
        }
        return {get: () => undefined};
    };

    const input = [
        "struct MainStruct {",
        "    1: required string sharedData = \"\" (go.tag='json:\"sharedData\"')",
        "    2: required i32    status                  (go.tag='json:\"status\"')",
        "    3: optional list<string> items = [] (custom.tag='x')",
        "}",
    ].join("\n");

    const out = runRangeFormat(input, 1, 4);
    const lines = out.split("\n");
    const annStart1 = lines[0].indexOf(" (");
    const annStart2 = lines[1].indexOf(" (");
    const annStart3 = lines[2].indexOf(" (");
    assert.notStrictEqual(annStart1, annStart2, "annotation columns should not align when disabled");
    assert.notStrictEqual(annStart1, annStart3, "annotation columns should not align when disabled");

    // restore
    vscode.workspace.getConfiguration = originalGetConfiguration;
}

(function main() {
    try {
        console.log("[test-range-context] Running tests...");
        testAlignAnnotationsEnabled();
        console.log("  ✓ align type/name/annotations when enabled");
        testAlignAnnotationsDisabled();
        console.log("  ✓ annotations not aligned when disabled");
        // Legacy compatibility: old key should still work
        (function testAlignAnnotationsDisabledLegacy() {
            const originalGetConfiguration = vscode.workspace.getConfiguration;
            vscode.workspace.getConfiguration = (section) => {
                if (section === "thrift.format") {
                    return {
                        get: (key) => {
                            const overrides = {
                                trailingComma: "preserve",
                                alignTypes: true,
                                alignFieldNames: true,

                                alignStructAnnotations: false, // legacy key
                                alignComments: true,
                                alignEnumNames: true,
                                alignEnumEquals: true,
                                alignEnumValues: true,
                                indentSize: 4,
                                maxLineLength: 100,
                                collectionStyle: "preserve",
                            };
                            return overrides[key];
                        },
                    };
                }
                return {get: () => undefined};
            };

            const input = [
                "struct MainStruct {",
                "    1: required string a (x='1')",
                "    2: required string bb (x='2')",
                "}",
            ].join("\n");
            const out = runRangeFormat(input, 1, 3);
            const lines = out.split("\n");
            const s1 = lines[0].indexOf(" (");
            const s2 = lines[1].indexOf(" (");
            assert.notStrictEqual(s1, s2, "legacy key alignStructAnnotations=false should disable alignment");
            vscode.workspace.getConfiguration = originalGetConfiguration;
        })();
        console.log("  ✓ legacy key alignStructAnnotations remains supported");
        console.log("All tests passed.");
    } catch (e) {
        console.error("Test failed:", e);
        process.exit(1);
    }
})();
