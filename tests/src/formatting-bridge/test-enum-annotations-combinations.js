"use strict";

const assert = require("assert");

const {ThriftFormattingProvider} = require('../../../out/formatting-bridge/index.js');
const vscode = require('vscode');

class MockDocument {
    constructor(text) {
        this._text = text;
        const vscode = require('vscode');
        this.uri = vscode.Uri.file('/test/enum-annotations.thrift');
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

describe('enum-annotations-combinations', () => {
    let originalGetConfiguration;

    before(() => {
        originalGetConfiguration = vscode.workspace.getConfiguration;
    });

    afterEach(() => {
        vscode.workspace.getConfiguration = originalGetConfiguration;
    });

    function withConfig(overrides, fn) {
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

    it('should align enum names, equals, and comments', () => {
        const input = [
            "enum E {",
            "    ACTIVE = 1, // a",
            "    INACTIVE = 10, // bb",
            "    UNKNOWN = 100 // c",
            "}",
        ].join("\n");
        const out = runRangeFormat(input, 1, 4);
        const lines = out.split("\n");

        const e1 = lines[0].indexOf(" = ");
        const e2 = lines[1].indexOf(" = ");
        const e3 = lines[2].indexOf(" = ");
        assert.strictEqual(e1, e2);
        assert.strictEqual(e1, e3);

        const c1 = lines[0].indexOf(" //");
        const c2 = lines[1].indexOf(" //");
        const c3 = lines[2].indexOf(" //");
        assert.strictEqual(c1, c2);
        assert.strictEqual(c1, c3);
    });

    it('should align values and comments when alignEnumValues is true', () => {
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

            const e1 = lines[0].indexOf(" = ");
            const e2 = lines[1].indexOf(" = ");
            const e3 = lines[2].indexOf(" = ");
            assert.strictEqual(e1, e2);
            assert.strictEqual(e1, e3);

            const c1 = lines[0].indexOf(" //");
            const c2 = lines[1].indexOf(" //");
            const c3 = lines[2].indexOf(" //");
            assert.strictEqual(c1, c2);
            assert.strictEqual(c1, c3);
        });
    });

    it('should respect trailing comma modes', () => {
        const input = [
            "enum E3 {",
            "    A = 1; // a",
            "    B = 2, // bb",
            "    C = 3 // c",
            "}",
        ].join("\n");

        withConfig({trailingComma: "add"}, () => {
            const out = runRangeFormat(input, 1, 4);
            const lines = out.split("\n");
            assert.ok(/;\s*$/.test(lines[0]));
            assert.ok(/,\s*$/.test(lines[1]));
            assert.ok(/,\s*$/.test(lines[2]));
        });

        withConfig({trailingComma: "remove"}, () => {
            const out = runRangeFormat(input, 1, 4);
            const lines = out.split("\n");
            assert.ok(/;\s*$/.test(lines[0]));
            assert.ok(!/,\s*$/.test(lines[1]));
            assert.ok(!/,\s*$/.test(lines[2]));
        });
    });
});
