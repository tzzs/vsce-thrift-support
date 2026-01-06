const assert = require('assert');

const {ThriftParser} = require('../../../out/ast/parser.js');
const {buildAstIndex} = require('../../../out/formatter/ast-index.js');

function run() {
    console.log('\nRunning thrift formatter AST index tests...');

    const content = [
        'const i32 A = 1',
        '',
        'struct User {',
        '  1: i32 id',
        '}',
        '',
        'enum Status {',
        '  ACTIVE = 1',
        '}',
        '',
        'service UserService {',
        '  void ping()',
        '}'
    ].join('\n');

    const ast = new ThriftParser(content).parse();
    const index = buildAstIndex(ast);

    assert.ok(index.constStarts.has(0), 'Expected const start at line 0');
    assert.ok(index.structStarts.has(2), 'Expected struct start at line 2');
    assert.ok(index.enumStarts.has(6), 'Expected enum start at line 6');
    assert.ok(index.serviceStarts.has(10), 'Expected service start at line 10');

    assert.ok(index.structFieldIndex.has(3), 'Expected struct field at line 3');
    assert.ok(index.enumMemberIndex.has(7), 'Expected enum member at line 7');

    console.log('✅ Thrift formatter AST index tests passed!');
}

try {
    run();
} catch (err) {
    console.error('❌ Thrift formatter AST index tests failed:', err);
    process.exit(1);
}
