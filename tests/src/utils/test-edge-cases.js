// Mock vscode is handled by require hook
const assert = require('assert');
const { ThriftParser } = require('../../../out/ast/parser.js');
const { ConfigService } = require('../../../out/config/service.js');

describe('Edge Cases and Boundary Conditions', () => {
    describe('Empty Thrift Files', () => {
        it('should handle empty thrift files gracefully', () => {
            const parser = new ThriftParser('');
            const ast = parser.parse();

            assert.ok(ast, 'Should return an AST');
            assert.ok(Array.isArray(ast.body), 'AST body should be an array');
            assert.strictEqual(ast.body.length, 0, 'Empty file should have empty body');
        });

        it('should handle files with only whitespace', () => {
            const parser = new ThriftParser('\n\n  \n\t\n');
            const ast = parser.parse();

            assert.strictEqual(ast.body.length, 0, 'Whitespace-only file should have empty body');
        });

        it('should handle files with only comments', () => {
            const parser = new ThriftParser('// This is a comment\n/* Multi-line comment */\n');
            const ast = parser.parse();

            assert.strictEqual(ast.body.length, 0, 'Comment-only file should have empty body');
        });
    });

    describe('Very Large Files', () => {
        it('should handle files with 1000+ lines without crashing', () => {
            // Generate a large thrift file with 1000 fields
            const lines = ['struct LargeStruct {'];
            for (let i = 0; i < 1000; i++) {
                lines.push(`  ${i}: optional string field${i}`);
            }
            lines.push('}');
            const content = lines.join('\n');

            const parser = new ThriftParser(content);
            const ast = parser.parse();

            assert.ok(ast, 'Should parse large file successfully');
            assert.strictEqual(ast.body.length, 1, 'Should have one struct');

            const struct = ast.body[0];
            assert.strictEqual(struct.fields.length, 1000, 'Should have 1000 fields');
        });

        it('should handle deeply nested structures', () => {
            // Create deeply nested structs
            let content = '';
            for (let i = 0; i < 50; i++) {
                content += `${'  '.repeat(i)}struct Nested${i} {\n`;
            }
            for (let i = 49; i >= 0; i--) {
                content += `${'  '.repeat(i)}}\n`;
            }

            const parser = new ThriftParser(content);
            const ast = parser.parse();

            assert.ok(ast, 'Should parse deeply nested structures');
            // Note: Exact validation depends on parser implementation
        });
    });

    describe('Extreme Configuration Values', () => {
        it('should handle minimum indent size', () => {
            const configService = new ConfigService();
            const result = configService.validate('format.indentSize', 1);
            assert.strictEqual(result.valid, true, 'Minimum indent size (1) should be valid');
        });

        it('should reject invalid indent size (too small)', () => {
            const configService = new ConfigService();
            const result = configService.validate('format.indentSize', 0);
            assert.strictEqual(result.valid, false, 'Indent size 0 should be invalid');
        });

        it('should reject invalid indent size (too large)', () => {
            const configService = new ConfigService();
            const result = configService.validate('format.indentSize', 9);
            assert.strictEqual(result.valid, false, 'Indent size 9 should be invalid');
        });

        it('should handle maximum line length', () => {
            const configService = new ConfigService();
            const result = configService.validate('format.maxLineLength', 200);
            assert.strictEqual(result.valid, true, 'Maximum line length (200) should be valid');
        });

        it('should reject invalid max line length', () => {
            const configService = new ConfigService();
            const result1 = configService.validate('format.maxLineLength', 39);
            const result2 = configService.validate('format.maxLineLength', 201);
            assert.strictEqual(result1.valid, false, 'Line length 39 should be invalid');
            assert.strictEqual(result2.valid, false, 'Line length 201 should be invalid');
        });

        it('should handle very large cache sizes', () => {
            const configService = new ConfigService();
            const cacheConfig = configService.getCacheConfig();

            // Verify cache config exists and has reasonable defaults
            assert.ok(cacheConfig, 'Should have cache config');
            // AST cache config is now under astMaxAgeMs, not nested ast object
            assert.ok(cacheConfig.astMaxAgeMs > 0, 'AST cache max age should be positive');
            assert.ok(cacheConfig.references, 'Should have references cache config');
            assert.ok(cacheConfig.references.maxSize > 0, 'References cache max size should be positive');
        });
    });

    describe('Special Characters', () => {
        it('should handle unicode characters in identifiers', () => {
            const content = `
                struct 你好 {
                  1: string 世界
                }
            `;
            const parser = new ThriftParser(content);
            const ast = parser.parse();

            assert.strictEqual(ast.body.length, 1, 'Should parse struct with unicode');
        });

        it('should handle special characters in string literals', () => {
            const content = `
                const string special = "hello\nworld\t\"quoted\"";
            `;
            const parser = new ThriftParser(content);
            const ast = parser.parse();

            assert.strictEqual(ast.body.length, 1, 'Should parse const with special chars');
        });
    });

    describe('Malformed Input', () => {
        it('should not crash on malformed thrift syntax', () => {
            const content = `
                struct {
                  incomplete
                }
            `;
            const parser = new ThriftParser(content);

            // Should not throw
            const ast = parser.parse();
            assert.ok(ast, 'Should return AST even for malformed input');
        });

        it('should handle unclosed braces', () => {
            const content = `
                struct Test {
                  1: string field
                // Missing closing brace
            `;
            const parser = new ThriftParser(content);
            const ast = parser.parse();

            assert.ok(ast, 'Should handle unclosed braces');
        });
    });
});
