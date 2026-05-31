const assert = require('assert');
const vscode = require('vscode');

const {
    ThriftDocumentHighlightProvider,
    collectHighlights
} = require('../../../out/document-highlight-provider.js');

const {ThriftParser} = require('../../../packages/core/out/ast/parser.js');

function createDoc(text, fsPath = '/tmp/t.thrift', version = 1) {
    const lines = text.split('\n');
    return {
        uri: {
            fsPath,
            scheme: 'file',
            path: fsPath,
            toString: () => `file://${fsPath}?v=${version}`
        },
        version,
        getText: (range) => {
            if (!range) {
                return text;
            }
            const sLine = range.start.line;
            const eLine = range.end.line;
            const sChar = range.start.character;
            const eChar = range.end.character;
            if (sLine === eLine) {
                return (lines[sLine] || '').substring(sChar, eChar);
            }
            return text;
        },
        lineAt: (line) => ({text: lines[line] || ''}),
        getWordRangeAtPosition: (position, regex) => {
            const lineText = lines[position.line] || '';
            const re = regex || /[A-Za-z_][A-Za-z0-9_]*/g;
            const matches = lineText.matchAll(new RegExp(re.source, 'g'));
            for (const m of matches) {
                if (m.index === undefined) continue;
                const start = m.index;
                const end = m.index + m[0].length;
                if (position.character >= start && position.character <= end) {
                    return {
                        start: {line: position.line, character: start},
                        end: {line: position.line, character: end}
                    };
                }
            }
            return null;
        }
    };
}

function highlightsFor(text, target) {
    const ast = new ThriftParser(text).parse();
    return collectHighlights(ast, target);
}

describe('document-highlight-provider', () => {
    it('highlights struct declaration as Write and its references as Read', () => {
        const text = [
            'struct User {',
            '  1: i32 id',
            '}',
            'struct Wrapper {',
            '  1: User who',
            '}'
        ].join('\n');
        const hl = highlightsFor(text, 'User');
        const writes = hl.filter(h => h.kind === vscode.DocumentHighlightKind.Write);
        const reads = hl.filter(h => h.kind === vscode.DocumentHighlightKind.Read);
        assert.strictEqual(writes.length, 1, 'expected one Write for struct User');
        assert.ok(reads.length >= 1, 'expected at least one Read for User reference');
    });

    it('highlights field names', () => {
        const text = [
            'struct A {',
            '  1: i32 id',
            '}',
            'struct B {',
            '  1: i32 id',
            '}'
        ].join('\n');
        const hl = highlightsFor(text, 'id');
        const writes = hl.filter(h => h.kind === vscode.DocumentHighlightKind.Write);
        assert.strictEqual(writes.length, 2);
    });

    it('highlights enum members', () => {
        const text = [
            'enum Status {',
            '  ACTIVE = 0,',
            '  INACTIVE = 1',
            '}'
        ].join('\n');
        const hl = highlightsFor(text, 'ACTIVE');
        assert.strictEqual(hl.length, 1);
        assert.strictEqual(hl[0].kind, vscode.DocumentHighlightKind.Write);
    });

    it('highlights service method definition as Write', () => {
        const text = [
            'service Greeter {',
            '  string hello(',
            '    1: string name',
            '  )',
            '}'
        ].join('\n');
        const hl = highlightsFor(text, 'hello');
        const writes = hl.filter(h => h.kind === vscode.DocumentHighlightKind.Write);
        assert.strictEqual(writes.length, 1);
    });

    it('skips primitive and container keywords', () => {
        const text = 'struct A {\n  1: list<i32> ids\n}';
        const hl = highlightsFor(text, 'i32');
        assert.deepStrictEqual(hl, []);
    });

    it('handles empty target', () => {
        const hl = highlightsFor('struct A {}', '');
        assert.deepStrictEqual(hl, []);
    });

    it('provider returns DocumentHighlight array for identifier under cursor', () => {
        const text = [
            'struct User {',
            '  1: i32 id',
            '}',
            'struct Wrap {',
            '  1: User who',
            '}'
        ].join('\n');
        const doc = createDoc(text);
        const provider = new ThriftDocumentHighlightProvider();
        const result = provider.provideDocumentHighlights(doc, {line: 0, character: 8}, {isCancellationRequested: false});
        const arr = Array.isArray(result) ? result : [];
        assert.ok(arr.length >= 2, 'expected at least one write + one read');
        const writes = arr.filter(h => h.kind === vscode.DocumentHighlightKind.Write);
        const reads = arr.filter(h => h.kind === vscode.DocumentHighlightKind.Read);
        assert.strictEqual(writes.length, 1);
        assert.ok(reads.length >= 1);
    });

    it('provider returns empty array on cancellation', () => {
        const provider = new ThriftDocumentHighlightProvider();
        const doc = createDoc('struct A {\n  1: i32 id\n}');
        const result = provider.provideDocumentHighlights(doc, {line: 0, character: 8}, {isCancellationRequested: true});
        assert.deepStrictEqual(result, []);
    });

    it('typedef alias references include underlying type', () => {
        const text = [
            'struct User {',
            '  1: i32 id',
            '}',
            'typedef User UserAlias',
            'struct Wrap {',
            '  1: UserAlias ua',
            '}'
        ].join('\n');
        const hl = highlightsFor(text, 'User');
        const writes = hl.filter(h => h.kind === vscode.DocumentHighlightKind.Write);
        const reads = hl.filter(h => h.kind === vscode.DocumentHighlightKind.Read);
        assert.strictEqual(writes.length, 1);
        assert.ok(reads.length >= 1, 'typedef alias references User → Read');
    });

    it('service extends produces Read highlight on the child service', () => {
        const text = [
            'service Base {',
            '  void f()',
            '}',
            'service Child extends Base {',
            '  void f()',
            '}'
        ].join('\n');
        const hl = highlightsFor(text, 'Base');
        const writes = hl.filter(h => h.kind === vscode.DocumentHighlightKind.Write);
        const reads = hl.filter(h => h.kind === vscode.DocumentHighlightKind.Read);
        assert.strictEqual(writes.length, 1);
        assert.ok(reads.length >= 1);
    });

    it('service extends Read highlight lands on the extends name, not the child nameRange', () => {
        // "service Child extends Base {" — Base starts at col 23
        const text = [
            'service Base {',
            '  void ping()',
            '}',
            'service Child extends Base {',
            '  void ping()',
            '}'
        ].join('\n');
        const hl = highlightsFor(text, 'Base');
        const reads = hl.filter(h => h.kind === vscode.DocumentHighlightKind.Read);
        assert.ok(reads.length >= 1, 'expected at least one Read highlight for extends name');
        // The Read highlight for the extends clause must NOT point to col 8 (where "Child" starts).
        // "service Child extends Base {" → "Base" starts at character 22
        const extendsRead = reads.find(h => h.range.start.line === 3);
        assert.ok(extendsRead, 'expected a Read highlight on line 3 (the extends line)');
        assert.notStrictEqual(
            extendsRead.range.start.character, 8,
            'Read highlight must not point to "Child" nameRange (col 8)'
        );
        assert.strictEqual(
            extendsRead.range.start.character, 22,
            'Read highlight must point to "Base" in extends clause (col 22)'
        );
    });
});
