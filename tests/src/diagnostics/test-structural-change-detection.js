const assert = require('assert');

const {diagnosticsTestUtils} = require('../../../out/diagnostics');

describe('structural-change-detection', () => {
    let includesKeyword, hasStructuralTokens, sanitizeStructuralText;

    before(() => {
        const utils = diagnosticsTestUtils;
        includesKeyword = utils.includesKeyword;
        hasStructuralTokens = utils.hasStructuralTokens;
        sanitizeStructuralText = utils.sanitizeStructuralText;
    });

    it('should detect include keyword', () => {
        assert.strictEqual(includesKeyword('include "foo.thrift"'), true);
    });

    it('should ignore include in comments', () => {
        assert.strictEqual(includesKeyword('// include "foo.thrift"'), false);
    });

    it('should ignore include in strings', () => {
        assert.strictEqual(includesKeyword('"include \\"foo.thrift\\""'), false);
        assert.strictEqual(includesKeyword('const string s = "include foo.thrift"'), false);
    });

    it('should detect structural tokens', () => {
        assert.strictEqual(hasStructuralTokens('struct User {'), true);
        assert.strictEqual(hasStructuralTokens('{'), true);
    });

    it('should ignore structural tokens in comments', () => {
        assert.strictEqual(hasStructuralTokens('/* struct User { */'), false);
        assert.strictEqual(hasStructuralTokens('// enum Status {'), false);
    });

    it('should ignore structural tokens in strings', () => {
        assert.strictEqual(hasStructuralTokens('note = "struct User {"'), false);
        assert.strictEqual(hasStructuralTokens('field = "{ }"'), false);
    });

    it('should sanitize structural text', () => {
        assert.strictEqual(
            sanitizeStructuralText('include "foo.thrift" // include "bar.thrift"').trim(),
            'include'
        );
    });
});