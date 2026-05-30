const assert = require('assert');

const {
    analyzeThriftText,
    DiagnosticSeverity,
    DIAGNOSTIC_RULES,
    getDiagnosticRule
} = require('@tanzz/thrift-core');

describe('diagnostics rule registry', function () {
    it('exposes stable metadata for all diagnostic rules', function () {
        const ruleIds = new Set(DIAGNOSTIC_RULES.map(rule => rule.id));

        assert.ok(ruleIds.has('field.duplicateId'));
        assert.ok(ruleIds.has('service.oneway.returnNotVoid'));
        assert.strictEqual(getDiagnosticRule('field.duplicateId').defaultSeverity, DiagnosticSeverity.Error);
        assert.strictEqual(getDiagnosticRule('field.duplicateId').hasFix, true);
    });

    it('can disable a rule by id without changing the issue shape', function () {
        const text = 'struct Foo {\n  1: i32 a\n  1: i32 b\n}\n';

        const issues = analyzeThriftText(text, undefined, undefined, {
            rules: {
                'field.duplicateId': false
            }
        });

        assert.strictEqual(issues.some(issue => issue.code === 'field.duplicateId'), false);
    });

    it('can override severity by rule id', function () {
        const text = 'struct Foo {\n  1: i32 a\n  1: i32 b\n}\n';

        const issue = analyzeThriftText(text, undefined, undefined, {
            rules: {
                'field.duplicateId': 'warning'
            }
        }).find(result => result.code === 'field.duplicateId');

        assert.strictEqual(issue.severity, DiagnosticSeverity.Warning);
        assert.strictEqual(issue.message, 'Duplicate field id 1');
    });
});
