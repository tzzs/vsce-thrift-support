const assert = require('assert');

const {isServiceMethodLine} = require('../../../out/formatter/service-method.js');

function run() {

    assert.ok(isServiceMethodLine('void ping()'), 'Expected simple method signature match');
    assert.ok(isServiceMethodLine('oneway void ping()'), 'Expected oneway method signature match');
    assert.ok(isServiceMethodLine('map<string,i32> get(1: i32 id)'), 'Expected generic return type match');
    assert.ok(
        isServiceMethodLine('void ping() throws (1: Error error);'),
        'Expected throws clause match'
    );

    assert.ok(!isServiceMethodLine('struct Foo {'), 'Expected struct declaration non-match');
    assert.ok(!isServiceMethodLine('i32'), 'Expected incomplete signature non-match');

}

describe('service-method', () => {
    it('should pass all test assertions', () => {
        run();
    });
});
