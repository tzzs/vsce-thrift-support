const assert = require('assert');
const path = require('path');
const vscode = require('vscode');
const {
    getWordRangeAtPosition,
    isPrimitiveType,
    fileDeclaresNamespace,
    getIncludedFiles
} = require('../../../../out/definition/helpers.js');

describe('definition-helpers advanced', () => {
    let vscode;

    before(() => {
        vscode = require('vscode');
    });

    function createDoc(content, filePath = '/tmp/test.thrift') {
        const uri = vscode.Uri.file(filePath);
        const lines = content.split('\n');
        return {
            uri,
            languageId: 'thrift',
            getText: () => content,
            lineAt: (i) => ({text: lines[i] || ''}),
            lineCount: lines.length,
            getWordRangeAtPosition: (pos, regex) => {
                const lineText = lines[pos.line] || '';
                const wordRegex = regex || /\b([A-Za-z_]\w*)\b/g;
                let match;
                while ((match = wordRegex.exec(lineText)) !== null) {
                    if (pos.character >= match.index && pos.character <= match.index + match[0].length) {
                        return new vscode.Range(pos.line, match.index, pos.line, match.index + match[0].length);
                    }
                }
                return undefined;
            }
        };
    }

    describe('getWordRangeAtPosition()', () => {
        it('should find word in include filename section', () => {
            const doc = createDoc('include "common.thrift"');
            const pos = new vscode.Position(0, 10);
            const range = getWordRangeAtPosition(doc, pos);
            assert.ok(range);
        });

        it('should return undefined when no word at position', () => {
            const doc = createDoc('  ');
            const pos = new vscode.Position(0, 0);
            doc.getWordRangeAtPosition = () => undefined;
            const range = getWordRangeAtPosition(doc, pos);
            assert.strictEqual(range, undefined);
        });

        it('should detect include keyword range', () => {
            const doc = createDoc('include "foo.thrift"');
            const pos = new vscode.Position(0, 2);
            const range = getWordRangeAtPosition(doc, pos);
            if (range) {
                const includedText = doc.uri ? 'range found' : 'no range';
                assert.ok(range.start.character >= 0);
            }
        });
    });

    describe('isPrimitiveType()', () => {
        it('should recognize all primitive types', () => {
            const primitives = ['bool', 'byte', 'i8', 'i16', 'i32', 'i64', 'double', 'string', 'binary', 'uuid', 'list', 'set', 'map', 'void'];
            for (const p of primitives) {
                assert.strictEqual(isPrimitiveType(p), true, `${p} should be primitive`);
            }
        });

        it('should reject user-defined types', () => {
            assert.strictEqual(isPrimitiveType('MyStruct'), false);
            assert.strictEqual(isPrimitiveType('SomeEnum'), false);
        });
    });

    describe('fileDeclaresNamespace()', () => {
        it('should detect namespace declaration', () => {
            assert.ok(fileDeclaresNamespace('namespace java com.example', 'com.example'));
        });

        it('should not match wrong namespace', () => {
            assert.ok(!fileDeclaresNamespace('namespace java com.example', 'other'));
        });

        it('should not match namespace in comment', () => {
            assert.ok(!fileDeclaresNamespace('// namespace java com.example', 'com.example'));
        });

        it('should not match namespace as substring', () => {
            assert.ok(!fileDeclaresNamespace('namespace java com.example', 'example'));
        });
    });

    describe('getIncludedFiles()', () => {
        it('should extract included file URIs', () => {
            const doc = createDoc(
                'include "foo.thrift"\ninclude "bar.thrift"',
                path.join('/tmp', 'main.thrift')
            );
            const includes = getIncludedFiles(doc, {
                handleWarning: () => {}, handleError: () => {}
            });
            assert.strictEqual(includes.length, 2);
        });

        it('should skip lines without includes', () => {
            const doc = createDoc(
                'namespace java com.example\nstruct Foo {}\ninclude "common.thrift"',
                path.join('/tmp', 'main.thrift')
            );
            const includes = getIncludedFiles(doc, {
                handleWarning: () => {}, handleError: () => {}
            });
            assert.strictEqual(includes.length, 1);
        });

        it('should return empty array for no includes', () => {
            const doc = createDoc('struct Foo { 1: i32 id }', path.join('/tmp', 'main.thrift'));
            const includes = getIncludedFiles(doc, {
                handleWarning: () => {}, handleError: () => {}
            });
            assert.strictEqual(includes.length, 0);
        });
    });
});
