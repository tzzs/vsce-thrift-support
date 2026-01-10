const assert = require('assert');
const {analyzeThriftText} = require('../../../out/diagnostics');

function findByCode(issues, code) {
    return issues.filter(i => i.code === code);
}

describe('throws-namespaced', () => {
    it('should recognize namespaced exception in throws', () => {
        const text = [
            'include "shared.thrift"',
            'exception MyError {}',
            'service S {',
            '  i32 doThing() throws (1: shared.MyError err)',
            '}',
        ].join('\n');

        const includedTypes = new Map([['MyError', 'exception']]);
        const issues = analyzeThriftText(text, undefined, includedTypes);

        assert.strictEqual(findByCode(issues, 'service.throws.unknown').length, 0, 'Should recognize namespaced exception in throws');
    });
});