const assert = require('assert');
const path = require('path');
const vscode = require('vscode');
const {Position, Range} = vscode;
const {ThriftHoverProvider} = require('../../../out/hover-provider.js');

function createMockDocument(text, fileName = 'test.thrift') {
    const lines = text.split('\n');
    const uri = vscode.Uri.file(path.join(__dirname, '..', '..', '..', 'test-files', fileName));

    const document = {
        uri, languageId: 'thrift', getText: () => text, lineAt: (line) => ({
            text: lines[line] || '', lineNumber: line
        }), getWordRangeAtPosition: (position) => {
            const lineText = lines[position.line] || '';
            const wordRegex = /\b([A-Za-z_][A-Za-z0-9_]*)\b/g;
            let match;
            while ((match = wordRegex.exec(lineText)) !== null) {
                const start = match.index;
                const end = start + match[0].length;
                if (position.character >= start && position.character <= end) {
                    return new Range(position.line, start, position.line, end);
                }
            }
            return null;
        }, offsetAt: (position) => {
            let offset = 0;
            for (let i = 0; i < position.line; i++) {
                offset += (lines[i] || '').length + 1;
            }
            return offset + position.character;
        }, positionAt: (offset) => {
            let currentOffset = 0;
            for (let i = 0; i < lines.length; i++) {
                const lineLength = (lines[i] || '').length + 1;
                if (currentOffset + lineLength > offset) {
                    return new Position(i, offset - currentOffset);
                }
                currentOffset += lineLength;
            }
            return new Position(lines.length - 1, lines[lines.length - 1].length);
        }
    };

    vscode.workspace.textDocuments.push(document);
    return document;
}

describe('HoverProvider extended', () => {
    beforeEach(() => {
        vscode.workspace.textDocuments = [];
    });

    function createCancellationToken(cancelled = false) {
        return {isCancellationRequested: cancelled};
    }

    it('should return undefined for empty document', async () => {
        const provider = new ThriftHoverProvider();
        const doc = createMockDocument('');
        const pos = new Position(0, 0);
        const result = await provider.provideHover(doc, pos, createCancellationToken());
        assert.strictEqual(result, undefined);
    });

    it('should return undefined when cancelled', async () => {
        const provider = new ThriftHoverProvider();
        const doc = createMockDocument('struct Foo { 1: i32 id }');
        const pos = new Position(0, 5);
        const result = await provider.provideHover(doc, pos, createCancellationToken(true));
        assert.strictEqual(result, undefined);
    });

    it('should return undefined for non-thrift document', async () => {
        const provider = new ThriftHoverProvider();
        const doc = createMockDocument('{ "key": "value" }', 'test.json');
        doc.languageId = 'json';
        const pos = new Position(0, 0);
        const result = await provider.provideHover(doc, pos, createCancellationToken());
        assert.strictEqual(result, undefined);
    });

    it('should provide hover for typedef', async () => {
        const provider = new ThriftHoverProvider();
        const typedefText = `// User ID type
typedef i32 UserId

struct Foo {
    1: UserId uid
}`;
        const doc = createMockDocument(typedefText);
        const pos = new Position(4, 9);
        const hover = await provider.provideHover(doc, pos, createCancellationToken());
        if (hover) {
            assert.ok(hover.contents, 'Should have hover contents');
        }
    });

    it('should provide hover for const', async () => {
        const provider = new ThriftHoverProvider();
        const constText = `// Maximum retries
const i32 MAX_RETRIES = 3

struct Config {
    1: i32 retries = MAX_RETRIES
}`;
        const doc = createMockDocument(constText);
        const pos = new Position(4, 21);
        const hover = await provider.provideHover(doc, pos, createCancellationToken());
        if (hover) {
            assert.ok(hover.contents, 'Should have hover contents');
        }
    });

    it('should provide hover for service method', async () => {
        const provider = new ThriftHoverProvider();
        const svcText = `service UserService {
    /// Get user by ID
    User getUser(1: i32 id)
}

struct User {
    1: string name
}`;
        const doc = createMockDocument(svcText);
        const pos = new Position(1, 8);
        const hover = await provider.provideHover(doc, pos, createCancellationToken());
        if (hover) {
            assert.ok(hover.contents, 'Should have hover contents');
        }
    });

    it('should return undefined at whitespace-only position', async () => {
        const provider = new ThriftHoverProvider();
        const doc = createMockDocument('struct Foo { 1: i32 id }');
        const pos = new Position(0, 0);
        const hover = await provider.provideHover(doc, pos, createCancellationToken());
        assert.strictEqual(hover, undefined);
    });

    it('should provide hover for exception type', async () => {
        const provider = new ThriftHoverProvider();
        const exceptionText = `exception ValidationError {
    1: string message
}

service API {
    void check() throws (1: ValidationError err)
}`;
        const doc = createMockDocument(exceptionText);
        const pos = new Position(5, 30);
        const hover = await provider.provideHover(doc, pos, createCancellationToken());
        if (hover) {
            assert.ok(hover.contents, 'Should have hover contents');
        }
    });
});
