const assert = require('assert');
const {analyzeThriftText} = require('../../../out/diagnostics');

function findByCode(issues, code) {
    return issues.filter(i => i.code === code);
}

describe('diagnostics-extends-namespaced', () => {
    it('should recognize namespaced parent service', () => {
        const text = [
            'include "shared.thrift"',
            'service UserService extends shared.SharedService {}',
        ].join('\n');

        const includedTypes = new Map([['SharedService', 'service']]);
        const issues = analyzeThriftText(text, undefined, includedTypes);

        assert.strictEqual(findByCode(issues, 'service.extends.unknown').length, 0, 'Should recognize namespaced parent service');
        assert.strictEqual(findByCode(issues, 'service.extends.notService').length, 0, 'Parent should be recognized as service');
    });
});