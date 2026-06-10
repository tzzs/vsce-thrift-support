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

function hoverText(hover) {
    return Array.isArray(hover.contents)
        ? hover.contents.map(c => typeof c === 'string' ? c : c.value).join('\n')
        : (hover.contents.value || '');
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
        assert.ok(hover, 'Expected hover result for typedef reference');
        assert.ok(hover.contents, 'Should have hover contents');
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
        assert.ok(hover, 'Expected hover result for const reference');
        assert.ok(hover.contents, 'Should have hover contents');
    });

    it('should provide hover for service method return type', async () => {
        const provider = new ThriftHoverProvider();
        const svcText = `service UserService {
    /// Get user by ID
    User getUser(1: i32 id)
}

struct User {
    1: string name
}`;
        const doc = createMockDocument(svcText);
        // Position (2, 4) points to "User" return type on line 2, not the doc comment on line 1
        const pos = new Position(2, 4);
        const hover = await provider.provideHover(doc, pos, createCancellationToken());
        assert.ok(hover, 'Expected hover result for service method return type');
        assert.ok(hover.contents, 'Should have hover contents');
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
        assert.ok(hover, 'Expected hover result for exception type reference');
        assert.ok(hover.contents, 'Should have hover contents');
    });

    // ---- Block comment (/** */ and /* */) doc comment extraction ----

    it('should extract /** */ JSDoc block comment in hover', async () => {
        const provider = new ThriftHoverProvider();
        const text = `/** A UUID value */
typedef string Uuid

struct Foo {
    1: Uuid id
}`;
        const doc = createMockDocument(text);
        const pos = new Position(4, 9); // on "Uuid" in struct Foo
        const hover = await provider.provideHover(doc, pos, createCancellationToken());
        assert.ok(hover, 'Expected hover result for typedef with /** */ doc');
        assert.ok(hover.contents, 'Should have hover contents');
        const contentStr = Array.isArray(hover.contents) ? hover.contents.map(c => typeof c === 'string' ? c : c.value).join(' ') : (hover.contents.value || '');
        assert.ok(contentStr.includes('UUID value'), 'Hover should include block comment text');
    });

    it('should extract /* */ plain block comment in hover', async () => {
        const provider = new ThriftHoverProvider();
        const text = `/* A simple block comment */
typedef i32 Count

struct Bar {
    1: Count total
}`;
        const doc = createMockDocument(text);
        const pos = new Position(4, 9); // on "Count"
        const hover = await provider.provideHover(doc, pos, createCancellationToken());
        assert.ok(hover, 'Expected hover result for typedef with /* */ doc');
        assert.ok(hover.contents, 'Should have hover contents');
    });

    it('should extract /** */ with leading * on each line (JSDoc style)', async () => {
        const provider = new ThriftHoverProvider();
        const text = `/**
 * Represents a user entity.
 * @param name The display name
 */
typedef string UserName

struct Profile {
    1: UserName name
}`;
        const doc = createMockDocument(text);
        const pos = new Position(7, 13); // on "UserName"
        const hover = await provider.provideHover(doc, pos, createCancellationToken());
        assert.ok(hover, 'Expected hover result for JSDoc typedef');
        assert.ok(hover.contents, 'Should have hover contents');
        const contentStr = Array.isArray(hover.contents) ? hover.contents.map(c => typeof c === 'string' ? c : c.value).join(' ') : (hover.contents.value || '');
        assert.ok(contentStr.includes('Represents a user entity'), 'Hover should include JSDoc description');
    });

    it('should handle block comment with blank line before definition', async () => {
        const provider = new ThriftHoverProvider();
        const text = `/** Doc comment with blank line after */

typedef i32 Gap

struct Baz {
    1: Gap val
}`;
        const doc = createMockDocument(text);
        const pos = new Position(5, 9); // on "Gap"
        const hover = await provider.provideHover(doc, pos, createCancellationToken());
        assert.ok(hover, 'Expected hover when blank line separates doc and definition');
        assert.ok(hover.contents, 'Should still extract doc comment across one blank line');
    });

    it('should return hover for struct with doc comment on field type', async () => {
        const provider = new ThriftHoverProvider();
        const text = `/// Temperature in Celsius
typedef double Celsius

struct Sensor {
    1: Celsius temp
}`;
        const doc = createMockDocument(text);
        const pos = new Position(4, 14); // on "Celsius"
        const hover = await provider.provideHover(doc, pos, createCancellationToken());
        assert.ok(hover, 'Expected hover for typedef with /// doc');
        assert.ok(hover.contents, 'Should have hover contents');
    });

    it('should normalize triple-slash method doc comments without a leading slash', async () => {
        const provider = new ThriftHoverProvider();
        const text = `service UserService {
    /// Get user by ID
    User getUser(1: i32 id)
}`;
        const doc = createMockDocument(text);
        const pos = new Position(2, 10); // on "getUser"
        const hover = await provider.provideHover(doc, pos, createCancellationToken());
        assert.ok(hover, 'Expected hover result for method with /// doc');
        const contentStr = hoverText(hover);
        assert.ok(contentStr.includes('Get user by ID'), 'Hover should include normalized method documentation');
        assert.ok(!contentStr.includes('/ Get user by ID'), 'Hover should not leave an extra slash from /// comments');
    });

    it('should extract hash method doc comments', async () => {
        const provider = new ThriftHoverProvider();
        const text = `service UserService {
    # Fetches the user record
    User getUser(1: i32 id)
}`;
        const doc = createMockDocument(text);
        const pos = new Position(2, 10); // on "getUser"
        const hover = await provider.provideHover(doc, pos, createCancellationToken());
        assert.ok(hover, 'Expected hover result for method with # doc');
        assert.ok(hoverText(hover).includes('Fetches the user record'), 'Hover should include hash comment documentation');
    });

    it('should not treat inline block comments on previous code as method docs', async () => {
        const provider = new ThriftHoverProvider();
        const text = `service UserService {
    void ping() /* not a doc for getUser */
    User getUser(1: i32 id)
}`;
        const doc = createMockDocument(text);
        const pos = new Position(2, 10); // on "getUser"
        const hover = await provider.provideHover(doc, pos, createCancellationToken());
        assert.ok(hover, 'Expected hover result for method');
        assert.ok(!hoverText(hover).includes('not a doc for getUser'), 'Hover should ignore inline block comments on code lines');
    });

    it('should return undefined when workspace.workspaceFolders is not set', async () => {
        const provider = new ThriftHoverProvider();
        const text = `typedef i32 Id

struct Holder {
    1: Id identifier
}`;
        const doc = createMockDocument(text);
        // Temporarily remove workspaceFolders to test fallback path
        const savedFolders = vscode.workspace.workspaceFolders;
        vscode.workspace.workspaceFolders = undefined;
        try {
            const pos = new Position(3, 9); // on "Id"
            const hover = await provider.provideHover(doc, pos, createCancellationToken());
            assert.ok(hover, 'Expected hover even without workspaceFolders');
        } finally {
            vscode.workspace.workspaceFolders = savedFolders;
        }
    });
});
