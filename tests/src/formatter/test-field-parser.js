const assert = require('assert');

const {
    isEnumFieldText,
    isStructFieldText,
    normalizeType,
    parseConstFieldText,
    parseEnumFieldText,
    parseStructFieldText,
    splitLineComment,
    splitTrailingAnnotation
} = require('../../../out/formatter/field-parser.js');

function run() {
    console.log('\nRunning thrift formatter field parser tests...');

    const commentSplit = splitLineComment('1: i32 id, // comment');
    assert.strictEqual(commentSplit.code.trim(), '1: i32 id,', 'Expected code to strip comment');
    assert.strictEqual(commentSplit.comment, '// comment', 'Expected comment to be preserved');

    const annotationSplit = splitTrailingAnnotation('1: string name (go.tag="x")');
    assert.strictEqual(annotationSplit.base.trim(), '1: string name', 'Expected annotation base');
    assert.strictEqual(annotationSplit.annotation, '(go.tag="x")', 'Expected annotation to be extracted');

    assert.strictEqual(normalizeType('map < string , i32 >'), 'map<string,i32>', 'Expected normalized type');

    const structField = parseStructFieldText('1: optional string name');
    assert.ok(structField, 'Expected struct field parse');
    assert.strictEqual(structField.id, '1', 'Expected field id');
    assert.strictEqual(structField.qualifier, 'optional', 'Expected qualifier');
    assert.strictEqual(structField.type, 'string', 'Expected type');
    assert.strictEqual(structField.name, 'name', 'Expected name');

    const enumField = parseEnumFieldText('ACTIVE = 1,');
    assert.ok(enumField, 'Expected enum field parse');
    assert.strictEqual(enumField.name, 'ACTIVE', 'Expected enum name');
    assert.strictEqual(enumField.value, '1', 'Expected enum value');
    assert.strictEqual(enumField.suffix, ',', 'Expected enum trailing comma');

    const constField = parseConstFieldText('const i32 ID = 1');
    assert.ok(constField, 'Expected const field parse');
    assert.strictEqual(constField.type, 'i32', 'Expected const type');
    assert.strictEqual(constField.name, 'ID', 'Expected const name');
    assert.strictEqual(constField.value, '1', 'Expected const value');

    assert.strictEqual(isStructFieldText('1: string name'), true, 'Expected struct field detection');
    assert.strictEqual(isStructFieldText('enum Status {'), false, 'Expected non-struct detection');

    assert.strictEqual(isEnumFieldText('ACTIVE = 1'), true, 'Expected enum field detection');
    assert.strictEqual(isEnumFieldText('1: string name'), false, 'Expected non-enum detection');

    console.log('✅ Thrift formatter field parser tests passed!');
}

try {
    run();
} catch (err) {
    console.error('❌ Thrift formatter field parser tests failed:', err);
    process.exit(1);
}
