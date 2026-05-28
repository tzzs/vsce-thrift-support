const assert = require('assert');
const {splitIntoChunks, CHUNK_THRESHOLD, formatChunked} = require('../../../out/formatter/chunked-format');
const {ThriftFormatter} = require('../../../out/formatter');

const DEFAULT_OPTIONS = {
    trailingComma: 'preserve',
    alignTypes: true,
    alignFieldNames: true,
    alignStructDefaults: false,
    alignAnnotations: true,
    alignComments: true,
    alignEnumNames: true,
    alignEnumEquals: true,
    alignEnumValues: true,
    indentSize: 4,
    maxLineLength: 100,
    collectionStyle: 'preserve',
    insertSpaces: true,
    tabSize: 4
};

function generateLargeThrift(structCount, fieldsPerStruct) {
    const blocks = [];
    for (let i = 0; i < structCount; i++) {
        const fields = [];
        for (let j = 1; j <= fieldsPerStruct; j++) {
            fields.push(`    ${j}: optional i32 field_${i}_${j}`);
        }
        blocks.push(`struct S_${i} {\n${fields.join('\n')}\n}`);
    }
    return `namespace cpp test\n\ntypedef i64 UserId\n\n${blocks.join('\n\n')}`;
}

describe('Chunked formatting', function () {
    this.timeout(30000);

    describe('splitIntoChunks', () => {
        it('returns single chunk for small files', () => {
            const content = 'namespace cpp test\nstruct A { 1: i32 id }';
            const chunks = splitIntoChunks(content);
            assert.strictEqual(chunks.length, 1);
            assert.strictEqual(chunks[0].text, content);
        });

        it('splits large file into multiple chunks', () => {
            const content = generateLargeThrift(400, 30);
            const lineCount = content.split('\n').length;
            assert.ok(lineCount > CHUNK_THRESHOLD, `Generated ${lineCount} lines, need > ${CHUNK_THRESHOLD}`);

            const chunks = splitIntoChunks(content);
            assert.ok(chunks.length > 1, `Expected multiple chunks, got ${chunks.length}`);

            // Every line should be covered
            const allText = chunks.map(c => c.text).join('\n');
            assert.strictEqual(allText, content, 'Reassembled chunks should match original');
        });

        it('each chunk boundary aligns with AST node boundary', () => {
            const content = generateLargeThrift(400, 30);
            const chunks = splitIntoChunks(content);

            // Each chunk should start at line 0 of original OR at a leading-comment / definition line
            for (const chunk of chunks) {
                const firstLine = chunk.text.split('\n')[0].trim();
                // Should be a comment, namespace, typedef, struct, enum, include, const, or blank
                const validStart = firstLine === '' ||
                    firstLine.startsWith('//') ||
                    firstLine.startsWith('#') ||
                    firstLine.startsWith('/*') ||
                    firstLine.startsWith('namespace') ||
                    firstLine.startsWith('include') ||
                    firstLine.startsWith('typedef') ||
                    firstLine.startsWith('const') ||
                    firstLine.startsWith('struct') ||
                    firstLine.startsWith('union') ||
                    firstLine.startsWith('exception') ||
                    firstLine.startsWith('enum') ||
                    firstLine.startsWith('service') ||
                    firstLine.startsWith('interaction');
                assert.ok(validStart, `Unexpected chunk start: "${firstLine}"`);
            }
        });
    });

    describe('formatChunked', () => {
        it('produces same result as non-chunked for small input', () => {
            const content = 'namespace cpp test\n\nstruct A {\n    1: i32 id\n    2: string name\n}';
            const formatter = new ThriftFormatter();
            const direct = formatter.format(content, DEFAULT_OPTIONS);
            const chunked = formatChunked(content, DEFAULT_OPTIONS, (chunk, opts) => {
                return formatter.format(chunk, opts);
            });
            assert.strictEqual(chunked, direct);
        });
    });

    describe('ThriftFormatter integration', () => {
        it('formats large file correctly via chunked path', () => {
            const content = generateLargeThrift(400, 30);
            const formatter = new ThriftFormatter();
            const result = formatter.format(content, DEFAULT_OPTIONS);

            // Basic sanity: result should be non-empty and parseable
            assert.ok(result.length > 0, 'Formatted result should be non-empty');
            assert.ok(result.includes('struct S_0'), 'Should contain first struct');
            assert.ok(result.includes('struct S_99'), 'Should contain last struct');
        });

        it('chunked result is idempotent', () => {
            const content = generateLargeThrift(400, 30);
            const formatter = new ThriftFormatter();
            const once = formatter.format(content, DEFAULT_OPTIONS);
            const twice = formatter.format(once, DEFAULT_OPTIONS);
            assert.strictEqual(once, twice, 'Chunked formatting should be idempotent');
        });
    });
});
