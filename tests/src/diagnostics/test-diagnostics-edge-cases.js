// Edge cases and boundary condition tests for diagnostics
const assert = require('assert');
const {analyzeThriftText} = require('../../../out/src/diagnostics.js');
const {createVscodeMock, installVscodeMock} = require('../../mock_vscode.js');
Module.prototype.require = originalRequire;

function findByCode(issues, code) {
    return issues.filter(i => i.code === code);
}

function run() {
    console.log('\nRunning diagnostics edge cases and boundary tests...');

    // Test 1: Empty file
    const emptyFile = '';
    let issues = analyzeThriftText(emptyFile);
    assert.ok(issues.length === 0, 'Empty file should not produce any issues');

    // Test 2: File with only comments
    const onlyComments = `// This is a comment
  /* This is a block comment */
  // Another comment`;
    issues = analyzeThriftText(onlyComments);
    assert.ok(issues.length === 0, 'File with only comments should not produce issues');

    // Test 3: File with only whitespace
    const onlyWhitespace = '   \n\t  \n   ';
    issues = analyzeThriftText(onlyWhitespace);
    assert.ok(issues.length === 0, 'File with only whitespace should not produce issues');

    // Test 4: Very long field names and values
    const longNames = `struct Test {
    1: string veryLongFieldNameThatExceedsNormalLengthButShouldStillBeValid = "veryLongStringValueThatExceedsNormalLengthButShouldStillBeValidForTestingPurposes",
    2: i32 anotherVeryLongFieldNameForTestingPurposes = 123456789
  }`;
    issues = analyzeThriftText(longNames);
    assert.ok(findByCode(issues, 'value.typeMismatch').length === 0, 'Long names and values should be handled correctly');

    // Test 5: Deeply nested container types
    const deeplyNested = `struct Test {
    1: list<map<string, set<list<map<i32, string>>>>> deeplyNested,
    2: map<string, list<set<map<i32, list<string>>>>> anotherDeep
  }`;
    issues = analyzeThriftText(deeplyNested);
    assert.ok(findByCode(issues, 'type.unknown').length === 0, 'Deeply nested container types should be parsed correctly');

    // Test 6: Mixed quote types in strings
    const mixedQuotes = `struct Test {
    1: string single = 'single quotes',
    2: string double = "double quotes",
    3: string escaped = "string with \\"escaped\\" quotes",
    4: string mixed = 'string with "mixed" quotes'
  }`;
    issues = analyzeThriftText(mixedQuotes);
    assert.ok(findByCode(issues, 'value.typeMismatch').length === 0, 'Mixed quote types should be handled correctly');

    // Test 7: Numbers at edge of type ranges
    const edgeNumbers = `struct Test {
    1: i8 maxI8 = 127,
    2: i8 minI8 = -128,
    3: i16 maxI16 = 32767,
    4: i16 minI16 = -32768,
    5: i32 maxI32 = 2147483647,
    6: i32 minI32 = -2147483648,
    7: i64 largeI64 = 9223372036854775807
  }`;
    issues = analyzeThriftText(edgeNumbers);
    assert.ok(findByCode(issues, 'value.typeMismatch').length === 0, 'Edge case numbers should be valid');

    // Test 8: Scientific notation in doubles
    const scientificNotation = `struct Test {
    1: double small = 1.23e-10,
    2: double large = 1.23e10,
    3: double negative = -1.23e-5,
    4: double positiveExp = 1.23E+5
  }`;
    issues = analyzeThriftText(scientificNotation);
    assert.ok(findByCode(issues, 'value.typeMismatch').length === 0, 'Scientific notation should be valid for doubles');

    // Test 9: Complex string escapes
    const complexEscapes = `struct Test {
    1: string escaped = "line1\\nline2\\ttab\\r\\\\backslash\\"quote",
    2: string unicode = "unicode: \\u0041\\u0042\\u0043",
    3: string hex = "hex: \\x41\\x42\\x43"
  }`;
    issues = analyzeThriftText(complexEscapes);
    assert.ok(findByCode(issues, 'value.typeMismatch').length === 0, 'Complex string escapes should be valid');

    // Test 10: Multiple inheritance levels
    const multipleInheritance = `service BaseService {
    void baseMethod()
  }
  service MiddleService extends BaseService {
    void middleMethod()
  }
  service DerivedService extends MiddleService {
    void derivedMethod()
  }`;
    issues = analyzeThriftText(multipleInheritance);
    assert.ok(findByCode(issues, 'service.extends.unknown').length === 0, 'Multiple inheritance levels should be valid');

    // Test 11: Large enum with many values
    const largeEnum = `enum Status {
    VALUE_0 = 0,
    VALUE_1 = 1,
    VALUE_2 = 2,
    VALUE_3 = 3,
    VALUE_4 = 4,
    VALUE_5 = 5,
    VALUE_6 = 6,
    VALUE_7 = 7,
    VALUE_8 = 8,
    VALUE_9 = 9,
    VALUE_10 = 10
  }`;
    issues = analyzeThriftText(largeEnum);
    assert.ok(findByCode(issues, 'enum.valueNotInteger').length === 0, 'Large enum should be valid');

    // Test 12: Struct with many fields
    const manyFields = `struct LargeStruct {
    1: string field1,
    2: i32 field2,
    3: double field3,
    4: bool field4,
    5: list<string> field5,
    6: map<string, i32> field6,
    7: set<i32> field7,
    8: binary field8,
    9: uuid field9,
    10: i64 field10,
    11: i16 field11,
    12: i8 field12
  }`;
    issues = analyzeThriftText(manyFields);
    assert.ok(findByCode(issues, 'field.duplicateId').length === 0, 'Struct with many fields should be valid');

    // Test 13: Service with many methods
    const manyMethods = `service LargeService {
    void method1(),
    i32 method2(),
    string method3(1: string param),
    list<string> method4(1: i32 param1, 2: string param2),
    map<string, i32> method5(),
    oneway void notify1(1: string message),
    oneway void notify2(1: i32 code),
    bool method8(1: bool flag),
    double method9(1: double value),
    binary method10(1: binary data)
  }`;
    issues = analyzeThriftText(manyMethods);
    assert.ok(findByCode(issues, 'service.oneway.returnNotVoid').length === 0, 'Service with many methods should be valid');

    // Test 14: Complex default values with nested structures
    const complexDefaults = `struct Test {
    1: list<map<string, list<i32>>> complex1 = [{"key1": [1, 2, 3], "key2": [4, 5, 6]}],
    2: map<string, set<string>> complex2 = {"group1": {"a", "b"}, "group2": {"c", "d"}},
    3: set<list<string>> complex3 = {["item1", "item2"], ["item3", "item4"]}
  }`;
    issues = analyzeThriftText(complexDefaults);
    assert.ok(findByCode(issues, 'value.typeMismatch').length === 0, 'Complex nested default values should be valid');

    // Test 15: Mixed case sensitivity
    const mixedCase = `struct Test {
    1: STRING field1, // should be flagged as unknown type
    2: string field2,
    3: I32 field3, // should be flagged as unknown type
    4: i32 field4
  }`;
    issues = analyzeThriftText(mixedCase);
    assert.ok(findByCode(issues, 'type.unknown').length === 2, 'Case-sensitive type checking should flag incorrect cases');

    // Test 16: Trailing commas and semicolons
    const trailingPunctuation = `struct Test {
    1: string field1,
    2: i32 field2,
  }
  enum Status {
    ACTIVE = 0,
    INACTIVE = 1,
  }`;
    issues = analyzeThriftText(trailingPunctuation);
    assert.ok(findByCode(issues, 'type.unknown').length === 0, 'Trailing commas should be handled gracefully');

    // Test 17: Unicode in identifiers (if supported)
    const unicodeIdentifiers = `struct TestUnicode {
    1: string field_with_underscore,
    2: i32 fieldWithCamelCase,
    3: double field123WithNumbers
  }`;
    issues = analyzeThriftText(unicodeIdentifiers);
    assert.ok(findByCode(issues, 'type.unknown').length === 0, 'Various identifier formats should be valid');

    // Test 18: Extreme nesting in brackets
    const extremeNesting = `struct Test {
    1: string field = "((()))",
    2: list<string> brackets = ["[[[", "]]]", "{{}", "}}"],
    3: map<string, string> mapping = {"key": "value{with}brackets"}
  }`;
    issues = analyzeThriftText(extremeNesting);
    assert.ok(findByCode(issues, 'value.typeMismatch').length === 0, 'Brackets in string values should not affect parsing');

    console.log('All diagnostics edge cases and boundary tests passed.');
}

run();