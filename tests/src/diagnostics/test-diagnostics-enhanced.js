// Enhanced diagnostics tests for new features (Node environment with vscode mock)
const assert = require('assert');
const {analyzeThriftText} = require('../../../out/src/diagnostics.js');
const {createVscodeMock, installVscodeMock} = require('../../mock_vscode.js');
Module.prototype.require = originalRequire;

function findByCode(issues, code) {
    return issues.filter(i => i.code === code);
}

function run() {
    console.log('\nRunning enhanced diagnostics tests...');

    // Test 1: Comment handling - single line comments
    const singleLineComment = `struct Test {
    1: i32 field1, // this is a comment
    2: string field2 // another comment
  }`;
    let issues = analyzeThriftText(singleLineComment);
    assert.ok(findByCode(issues, 'type.unknown').length === 0, 'Comments should not interfere with parsing');

    // Test 2: Comment handling - multi-line block comments
    const blockComment = `struct Test {
    1: i32 field1, /* this is a 
       multi-line comment */
    2: string field2
  }`;
    issues = analyzeThriftText(blockComment);
    assert.ok(findByCode(issues, 'type.unknown').length === 0, 'Block comments should be properly stripped');

    // Test 3: Comment handling - nested comments in strings
    const commentInString = `struct Test {
    1: string field1 = "this // is not a comment",
    2: string field2 = "this /* is also */ not a comment"
  }`;
    issues = analyzeThriftText(commentInString);
    assert.ok(findByCode(issues, 'value.typeMismatch').length === 0, 'Comments inside strings should be preserved');

    // Test 4: Type annotations handling
    const typeAnnotations = `struct Test {
    1: required string name (go.tag='json:"name"'),
    2: optional i32 count (cpp.type = "int32_t")
  }`;
    issues = analyzeThriftText(typeAnnotations);
    assert.ok(findByCode(issues, 'value.typeMismatch').length === 0, 'Type annotations should not be treated as default values');

    // Test 5: UUID type validation - valid UUIDs
    const validUuid = `struct Test {
    1: uuid id1 = "123e4567-e89b-12d3-a456-426614174000",
    2: uuid id2 = "550e8400-e29b-41d4-a716-446655440000"
  }`;
    issues = analyzeThriftText(validUuid);
    assert.ok(findByCode(issues, 'value.typeMismatch').length === 0, 'Valid UUIDs should pass validation');

    // Test 6: UUID type validation - invalid UUIDs
    const invalidUuid = `struct Test {
    1: uuid id1 = "not-a-uuid",
    2: uuid id2 = "123e4567-e89b-12d3-a456-42661417400", // too short
    3: uuid id3 = "123e4567-e89b-12d3-a456-42661417400g" // invalid char
  }`;
    issues = analyzeThriftText(invalidUuid);
    assert.ok(findByCode(issues, 'value.typeMismatch').length === 3, 'Invalid UUIDs should be flagged');

    // Test 7: Container type validation - complex nested types
    const nestedContainers = `struct Test {
    1: list<map<string, set<i32>>> complex1,
    2: map<string, list<map<i32, string>>> complex2,
    3: set<list<string>> complex3
  }`;
    issues = analyzeThriftText(nestedContainers);
    assert.ok(findByCode(issues, 'type.unknown').length === 0, 'Complex nested container types should be valid');

    // Test 8: Container type validation - invalid container syntax
    const invalidContainers = `struct Test {
    1: list<> empty,
    2: map<string> incomplete,
    3: set<i32, string> toomany
  }`;
    issues = analyzeThriftText(invalidContainers);
    assert.ok(findByCode(issues, 'type.unknown').length >= 2, 'Invalid container syntax should be flagged');

    // Test 9: Default value extraction - complex scenarios
    const complexDefaults = `struct Test {
    1: list<string> names = ["alice", "bob"],
    2: map<string, i32> counts = {"a": 1, "b": 2},
    3: set<i32> numbers = {1, 2, 3},
    4: string annotated = "value" (annotation="test")
  }`;
    issues = analyzeThriftText(complexDefaults);
    assert.ok(findByCode(issues, 'value.typeMismatch').length === 0, 'Complex default values should be parsed correctly');

    // Test 10: Set default value with bracket notation (lenient parsing)
    const setBracketDefault = `struct Test {
    1: set<string> tags = ["tag1", "tag2"],
    2: set<i32> numbers = [1, 2, 3]
  }`;
    issues = analyzeThriftText(setBracketDefault);
    assert.ok(findByCode(issues, 'value.typeMismatch').length === 0, 'Set defaults with [] should be accepted (lenient)');

    // Test 11: Enhanced enum value validation - now supports negative values
    const enumValidation = `enum Status {
    ACTIVE = 0,
    INACTIVE = 1,
    PENDING = 2,
    VALID_NEG = -1,
    VALID_NEG2 = -100,
    INVALID_FLOAT = 1.5,
    INVALID_HEX = 0xFF
  }`;
    issues = analyzeThriftText(enumValidation);
    console.log('Test 11 - Issues found:', issues.map(i => i.code));
    assert.ok(findByCode(issues, 'enum.negativeValue').length === 0, 'Negative enum values should now be allowed');
    assert.ok(findByCode(issues, 'enum.valueNotInteger').length === 2, 'Float and hex enum values should be flagged');
    console.log('Test 11 passed: Negative enum values are now allowed, float/hex values are flagged');

    // Test 11b: Additional enum tests with various negative values
    const enumWithNegatives = `enum ErrorCode {
    SUCCESS = 0,
    ERROR_GENERAL = -1,
    ERROR_INVALID_PARAM = -2,
    ERROR_TIMEOUT = -100,
    ERROR_NETWORK = -1000,
    MIN_INT32 = -2147483648,
    MAX_INT32 = 2147483647
  }`;
    issues = analyzeThriftText(enumWithNegatives);
    assert.ok(findByCode(issues, 'enum.negativeValue').length === 0, 'All negative enum values should be allowed');
    assert.ok(findByCode(issues, 'enum.valueNotInteger').length === 0, 'All values should be valid integers');

    // Test 12: Service method validation - oneway restrictions
    const onewayService = `service TestService {
    oneway void notify(1: string message),
    oneway i32 invalidReturn(),
    oneway void invalidThrows() throws (1: Exception ex)
  }
  exception Exception {
    1: string message
  }`;
    issues = analyzeThriftText(onewayService);
    assert.ok(findByCode(issues, 'service.oneway.returnNotVoid').length === 1, 'oneway with non-void return should be flagged');
    assert.ok(findByCode(issues, 'service.oneway.hasThrows').length === 1, 'oneway with throws should be flagged');

    // Test 13: Service throws validation
    const serviceThrows = `struct NotException {
    1: string message
  }
  exception ValidException {
    1: string message
  }
  service TestService {
    void method1() throws (1: ValidException ex),
    void method2() throws (1: NotException ex),
    void method3() throws (1: UnknownException ex)
  }`;
    issues = analyzeThriftText(serviceThrows);
    assert.ok(findByCode(issues, 'service.throws.notException').length === 1, 'Non-exception in throws should be flagged');
    assert.ok(findByCode(issues, 'service.throws.unknown').length === 1, 'Unknown exception in throws should be flagged');

    // Test 14: Service extends validation
    const serviceExtends = `service BaseService {
    void baseMethod()
  }
  struct NotAService {
    1: string field
  }
  service DerivedService extends BaseService {
    void derivedMethod()
  }
  service InvalidService extends NotAService {
    void method()
  }
  service UnknownService extends NonExistentService {
    void method()
  }`;
    issues = analyzeThriftText(serviceExtends);
    assert.ok(findByCode(issues, 'service.extends.notService').length === 1, 'Extending non-service should be flagged');
    assert.ok(findByCode(issues, 'service.extends.unknown').length === 1, 'Extending unknown type should be flagged');

    // Test 15: Typedef validation with unknown base types
    const typedefValidation = `typedef string ValidTypedef
  typedef UnknownType InvalidTypedef
  typedef list<UnknownInner> InvalidContainer`;
    issues = analyzeThriftText(typedefValidation);
    assert.ok(findByCode(issues, 'typedef.unknownBase').length === 2, 'Typedef unknown base and container inner should be flagged');
    assert.ok(findByCode(issues, 'type.unknown').length === 0, 'Container inner unknown is reported via typedef base validation');

    // Test 16: Bracket/brace balance validation
    const unbalancedBrackets = `struct Test {
    1: string field1
  } // extra closing brace
  }
  struct Test2 {
    1: string field2
  // missing closing brace`;
    issues = analyzeThriftText(unbalancedBrackets);
    assert.ok(findByCode(issues, 'syntax.unmatchedCloser').length >= 1, 'Unmatched closing brackets should be flagged');
    assert.ok(findByCode(issues, 'syntax.unclosed').length >= 1, 'Unclosed brackets should be flagged');

    // Test 17: Field ID validation across different contexts
    const fieldIdValidation = `struct Struct1 {
    1: string field1,
    2: i32 field2,
    1: double duplicate // duplicate in same struct
  }
  struct Struct2 {
    1: string field1, // OK - different struct
    2: i32 field2
  }
  union Union1 {
    1: string option1,
    2: i32 option2,
    2: double duplicate // duplicate in union
  }`;
    issues = analyzeThriftText(fieldIdValidation);
    assert.ok(findByCode(issues, 'field.duplicateId').length === 2, 'Duplicate field IDs should be flagged per type block');

    console.log('All enhanced diagnostics tests passed.');
}

run();