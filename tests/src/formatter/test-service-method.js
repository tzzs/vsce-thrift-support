const assert = require('assert');

const { isServiceMethodLine } = require('../../../out/formatter/service-method.js');

function run() {
    console.log('\nRunning thrift formatter service method tests...');

    assert.ok(isServiceMethodLine('void ping()'), 'Expected simple method signature match');
    assert.ok(isServiceMethodLine('oneway void ping()'), 'Expected oneway method signature match');
    assert.ok(isServiceMethodLine('map<string,i32> get(1: i32 id)'), 'Expected generic return type match');
    assert.ok(
        isServiceMethodLine('void ping() throws (1: Error error);'),
        'Expected throws clause match'
    );

    assert.ok(!isServiceMethodLine('struct Foo {'), 'Expected struct declaration non-match');
    assert.ok(!isServiceMethodLine('i32'), 'Expected incomplete signature non-match');

    console.log('✅ Thrift formatter service method tests passed!');
}

try {
    run();
} catch (err) {
    console.error('❌ Thrift formatter service method tests failed:', err);
    process.exit(1);
}
