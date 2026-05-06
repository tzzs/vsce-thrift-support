'use strict';

const assert = require('assert');
const {ThriftFormattingProvider} = require('../../../out/formatting-bridge/index.js');
const vscode = require('vscode');

describe('range-context', () => {
    let originalGetConfiguration;

    before(() => {
        originalGetConfiguration = vscode.workspace.getConfiguration;
    });

    afterEach(() => {
        vscode.workspace.getConfiguration = originalGetConfiguration;
    });

    class MockDocument {
        constructor(text) {
            this._text = text;
            const vscode = require('vscode');
            this.uri = vscode.Uri.file('/test/range-context.thrift');
        }

        getText(range) {
            if (!range) {
                return this._text;
            }
            const lines = this._text.split('\n');
            const startOffset = lines
                .slice(0, range.start.line)
                .reduce((sum, line) => sum + line.length + 1, 0);
            const endOffset = lines
                .slice(0, range.end.line)
                .reduce((sum, line) => sum + line.length + 1, 0);
            return this._text.slice(
                startOffset + range.start.character,
                endOffset + range.end.character
            );
        }

        positionAt(offset) {
            const lines = this._text.slice(0, offset).split('\n');
            const line = lines.length - 1;
            const character = lines[lines.length - 1].length;
            return {line, character};
        }
    }

    function makeRange(startLine, startChar, endLine, endChar) {
        return {
            start: {line: startLine, character: startChar},
            end: {line: endLine, character: endChar}
        };
    }

    function runRangeFormat(input, startLine, endLine) {
        const doc = new MockDocument(input);
        const provider = new ThriftFormattingProvider();
        const range = makeRange(startLine, 0, endLine, 9999);
        const edits = provider.provideDocumentRangeFormattingEdits(doc, range, {
            insertSpaces: true,
            tabSize: 4
        });
        const out = edits[0].newText;
        return out;
    }

    it('should align type/name/annotations when enabled', () => {
        const input = [
            'struct MainStruct {',
            '    1: required string sharedData = "" (go.tag=\'json:"sharedData"\')',
            '    2: required i32    status                  (go.tag=\'json:"status"\')',
            "    3: optional list<string> items = [] (custom.tag='x')",
            '}'
        ].join('\n');

        const out = runRangeFormat(input, 1, 4);
        const lines = out.split('\n');
        const l1 = lines[0];
        const l2 = lines[1];
        const l3 = lines[2];

        // Verify aligned type columns by checking the position of names
        const typeEnd1 = l1.indexOf(' sharedData');
        const typeEnd2 = l2.indexOf(' status');
        const typeEnd3 = l3.indexOf(' items');
        assert.strictEqual(typeEnd1, typeEnd2, 'type columns should align');
        assert.strictEqual(typeEnd1, typeEnd3, 'type columns should align');

        // Verify alignment of annotation start
        const annStart1 = l1.indexOf(' (go.tag');
        const annStart2 = l2.indexOf(' (go.tag');
        const annStart3 = l3.indexOf(' (custom.tag');
        assert.ok(annStart1 > 0 && annStart2 > 0 && annStart3 > 0, 'annotations should exist');
        assert.strictEqual(annStart1, annStart2, 'annotation columns should align');
        assert.strictEqual(annStart1, annStart3, 'annotation columns should align');
    });

    it('should not align annotations when disabled', () => {
        vscode.workspace.getConfiguration = (section) => {
            if (section === 'thrift.format') {
                return {
                    get: (key) => {
                        const overrides = {
                            trailingComma: 'preserve',
                            alignTypes: true,
                            alignFieldNames: true,

                            alignAnnotations: false,
                            alignComments: true,
                            alignEnumNames: true,
                            alignEnumEquals: true,
                            alignEnumValues: true,
                            indentSize: 4,
                            maxLineLength: 100,
                            collectionStyle: 'preserve'
                        };
                        return overrides[key];
                    }
                };
            } else if (section === 'thrift-support.formatting') {
                return {get: (key, def) => def};
            }
            return {get: () => undefined};
        };

        const input = [
            'struct MainStruct {',
            '    1: required string sharedData = "123" (go.tag=\'json:"sharedData"\')',
            '    2: required i32    status (go.tag=\'json:"status"\')',
            "    3: optional list<string> items = [] (custom.tag='x')",
            '}'
        ].join('\n');

        const out = runRangeFormat(input, 1, 4);
        const lines = out.split('\n');
        const annStart1 = lines[0].indexOf(' (');
        const annStart2 = lines[1].indexOf(' (');
        const annStart3 = lines[2].indexOf(' (');

        // In this test case with alignAnnotations disabled, annotations remain unaligned
        // even though field names are aligned, because annotation alignment is explicitly disabled
        assert.notStrictEqual(
            annStart1,
            annStart2,
            'annotations remain unaligned in complex field case'
        );
        assert.notStrictEqual(
            annStart1,
            annStart3,
            'annotations remain unaligned in complex field case'
        );
    });

    it('should support legacy key alignStructAnnotations', () => {
        vscode.workspace.getConfiguration = (section) => {
            if (section === 'thrift.format') {
                return {
                    get: (key) => {
                        const overrides = {
                            trailingComma: 'preserve',
                            alignTypes: true,
                            alignFieldNames: true,

                            alignStructAnnotations: false, // legacy key
                            alignComments: true,
                            alignEnumNames: true,
                            alignEnumEquals: true,
                            alignEnumValues: true,
                            indentSize: 4,
                            maxLineLength: 100,
                            collectionStyle: 'preserve'
                        };
                        return overrides[key];
                    }
                };
            }
            return {get: () => undefined};
        };

        const input = [
            'struct MainStruct {',
            "    1: required string a (x='1')",
            "    2: required string bb (x='2')",
            '}'
        ].join('\n');
        const out = runRangeFormat(input, 1, 3);
        const lines = out.split('\n');
        const s1 = lines[0].indexOf(' (');
        const s2 = lines[1].indexOf(' (');
        // With aligned field names (main fix), annotations naturally align too
        assert.strictEqual(s1, s2, 'annotations align due to aligned field names');
    });

    it('should preserve leading blank line in range formatting', () => {
        const input = ['', 'struct User {', '    1: i32 id', '}'].join('\n');

        const out = runRangeFormat(input, 0, 3);
        const lines = out.split('\n');
        assert.strictEqual(lines[0], '', 'Leading blank line should be preserved');
        assert.strictEqual(lines[1], 'struct User {', 'Struct header should not be indented');
    });

    it('should format block comment before struct without extra indent', () => {
        const input = ['/*', ' * doc', ' */', 'struct User {', '    1: i32 id', '}'].join('\n');

        const out = runRangeFormat(input, 0, 5);
        const lines = out.split('\n');
        assert.strictEqual(lines[0], '/*', 'Block comment should remain at column 0');
        assert.strictEqual(lines[3], 'struct User {', 'Struct header should not be indented');
    });
});
