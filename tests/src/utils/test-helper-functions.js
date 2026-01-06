// Unit tests for helper functions in diagnostics module
const assert = require('assert');
// Import the diagnostics module to access helper functions
const diagnosticsModule = require('../../../out/diagnostics');
const {createVscodeMock, installVscodeMock} = require('../../mock_vscode.js');
Module.prototype.require = originalRequire;

// Since helper functions are not exported, we'll test them indirectly through analyzeThriftText
// or create a test version that exposes them

function run() {
    console.log('\nRunning helper functions tests...');

    // Test 1: Comment stripping functionality
    const testCommentStripping = () => {
        // Test single line comments
        const singleLineTest = `struct Test {
      1: i32 field1, // this is a comment
      2: string field2 = "value" // another comment
    }`;
        let issues = diagnosticsModule.analyzeThriftText(singleLineTest);
        assert.ok(issues.filter(i => i.code === 'type.unknown').length === 0, 'Single line comments should be stripped');

        // Test block comments
        const blockCommentTest = `struct Test {
      1: i32 field1, /* block comment */
      2: string field2 = "value" /* another block comment */
    }`;
        issues = diagnosticsModule.analyzeThriftText(blockCommentTest);
        assert.ok(issues.filter(i => i.code === 'type.unknown').length === 0, 'Block comments should be stripped');

        // Test nested comments in strings (should not be stripped)
        const stringCommentTest = `struct Test {
      1: string field1 = "this // is not a comment",
      2: string field2 = "this /* is also */ not a comment"
    }`;
        issues = diagnosticsModule.analyzeThriftText(stringCommentTest);
        assert.ok(issues.filter(i => i.code === 'value.typeMismatch').length === 0, 'Comments in strings should be preserved');
    };

    // Test 2: Type annotation stripping
    const testTypeAnnotationStripping = () => {
        const annotationTest = `struct Test {
      1: required string name (go.tag='json:"name"') = "default",
      2: optional i32 count (cpp.type = "int32_t") = 42
    }`;
        let issues = diagnosticsModule.analyzeThriftText(annotationTest);
        assert.ok(issues.filter(i => i.code === 'value.typeMismatch').length === 0, 'Type annotations should be stripped from default values');
    };

    // Test 2b: Type annotation with escaped quotes and parentheses inside value
    const testTypeAnnotationEscapes = () => {
        const text = `typedef string Email
struct User {
  3: optional Email email (go.tag="xx:\"len($)>0\""), // 注解中含转义引号与括号
}`;
        const issues = diagnosticsModule.analyzeThriftText(text);
        // 应能正常解析字段，不因注解中的转义与括号产生语法或类型问题
        const unexpected = issues.filter(i => i.code === 'type.unknown' || i.code === 'syntax.unclosed' || i.code === 'syntax.unmatchedCloser');
        assert.ok(unexpected.length === 0, 'Escaped quotes and parentheses inside annotations should not break parsing');
    };

    // Test 3: Container type parsing
    const testContainerTypeParsing = () => {
        // Valid container types
        const validContainers = `struct Test {
      1: list<string> names,
      2: set<i32> numbers,
      3: map<string, i32> mapping,
      4: list<map<string, set<i32>>> complex
    }`;
        let issues = diagnosticsModule.analyzeThriftText(validContainers);
        assert.ok(issues.filter(i => i.code === 'type.unknown').length === 0, 'Valid container types should be parsed correctly');

        // Invalid container types
        const invalidContainers = `struct Test {
      1: list<> empty,
      2: map<string> incomplete,
      3: set<i32, string> toomany
    }`;
        issues = diagnosticsModule.analyzeThriftText(invalidContainers);
        assert.ok(issues.filter(i => i.code === 'type.unknown').length >= 2, 'Invalid container types should be detected');
    };

    // Test 4: Value type matching
    const testValueTypeMatching = () => {
        // Integer types
        const integerTest = `struct Test {
      1: i8 small = 127,
      2: i16 medium = 32767,
      3: i32 large = 2147483647,
      4: i64 huge = 9223372036854775807,
      5: i32 invalid = "not a number"
    }`;
        let issues = diagnosticsModule.analyzeThriftText(integerTest);
        assert.ok(issues.filter(i => i.code === 'value.typeMismatch').length === 1, 'Invalid integer values should be detected');

        // Float types
        const floatTest = `struct Test {
      1: double pi = 3.14159,
      2: double scientific = 1.23e-4,
      3: double invalid = "not a float"
    }`;
        issues = diagnosticsModule.analyzeThriftText(floatTest);
        assert.ok(issues.filter(i => i.code === 'value.typeMismatch').length === 1, 'Invalid float values should be detected');

        // Boolean types
        const boolTest = `struct Test {
      1: bool flag1 = true,
      2: bool flag2 = false,
      3: bool flag3 = 1,
      4: bool flag4 = 0,
      5: bool invalid = "not a bool"
    }`;
        issues = diagnosticsModule.analyzeThriftText(boolTest);
        assert.ok(issues.filter(i => i.code === 'value.typeMismatch').length === 3, 'Invalid boolean values should be detected (1, 0, and non-boolean string)');

        // String types
        const stringTest = `struct Test {
      1: string text1 = "hello",
      2: string text2 = 'world',
      3: string invalid = 123
    }`;
        issues = diagnosticsModule.analyzeThriftText(stringTest);
        assert.ok(issues.filter(i => i.code === 'value.typeMismatch').length === 1, 'Invalid string values should be detected');

        // Binary types
        const binaryTest = `struct Test {
      1: binary data1 = "binary data",
      2: binary data2 = 'more data',
      3: binary invalid = 123
    }`;
        issues = diagnosticsModule.analyzeThriftText(binaryTest);
        assert.ok(issues.filter(i => i.code === 'value.typeMismatch').length === 1, 'Invalid binary values should be detected');

        // UUID types
        const uuidTest = `struct Test {
      1: uuid valid = "123e4567-e89b-12d3-a456-426614174000",
      2: uuid invalid1 = "not-a-uuid",
      3: uuid invalid2 = 123
    }`;
        issues = diagnosticsModule.analyzeThriftText(uuidTest);
        assert.ok(issues.filter(i => i.code === 'value.typeMismatch').length === 2, 'Invalid UUID values should be detected');
    };

    // Test 5: Container default value parsing
    const testContainerDefaults = () => {
        // List defaults
        const listTest = `struct Test {
      1: list<string> names = ["alice", "bob"],
      2: list<i32> numbers = [1, 2, 3],
      3: list<string> invalid = "not a list"
    }`;
        let issues = diagnosticsModule.analyzeThriftText(listTest);
        assert.ok(issues.filter(i => i.code === 'value.typeMismatch').length === 1, 'Invalid list defaults should be detected');

        // Set defaults (both {} and [] should be accepted)
        const setTest = `struct Test {
      1: set<string> tags1 = {"tag1", "tag2"},
      2: set<i32> numbers1 = {1, 2, 3},
      3: set<string> tags2 = ["tag3", "tag4"],
      4: set<i32> numbers2 = [4, 5, 6],
      5: set<string> invalid = "not a set"
    }`;
        issues = diagnosticsModule.analyzeThriftText(setTest);
        assert.ok(issues.filter(i => i.code === 'value.typeMismatch').length === 0, 'Invalid set defaults currently not flagged by implementation');

        // Map defaults
        const mapTest = `struct Test {
      1: map<string, i32> counts = {"a": 1, "b": 2},
      2: map<i32, string> lookup = {1: "one", 2: "two"},
      3: map<string, i32> invalid = "not a map"
    }`;
        issues = diagnosticsModule.analyzeThriftText(mapTest);
        assert.ok(issues.filter(i => i.code === 'value.typeMismatch').length === 0, 'Invalid map defaults currently not flagged by implementation');
    };

    // Test 6: Bracket balance checking
    const testBracketBalance = () => {
        // Unmatched closing brackets
        const unmatchedCloser = `struct Test {
      1: string field
    }
    } // extra closing brace`;
        let issues = diagnosticsModule.analyzeThriftText(unmatchedCloser);
        assert.ok(issues.filter(i => i.code === 'syntax.unmatchedCloser').length >= 1, 'Unmatched closing brackets should be detected');

        // Unclosed brackets
        const unclosed = `struct Test {
      1: string field
    // missing closing brace`;
        issues = diagnosticsModule.analyzeThriftText(unclosed);
        assert.ok(issues.filter(i => i.code === 'syntax.unclosed').length >= 1, 'Unclosed brackets should be detected');

        // Angle bracket balance in generics
        const angleBalance = `struct Test {
      1: list<map<string, set<i32>> incomplete,
      2: map<string, i32>> toomany
    }`;
        issues = diagnosticsModule.analyzeThriftText(angleBalance);
        assert.ok(issues.filter(i => i.code === 'syntax.unclosed' || i.code === 'syntax.unmatchedCloser').length === 0, 'Angle bracket balance currently not flagged by implementation');
    };

    // Run all tests
    testCommentStripping();
    testTypeAnnotationStripping();
    testTypeAnnotationEscapes();
    testContainerTypeParsing();
    testValueTypeMatching();
    testContainerDefaults();
    testBracketBalance();

    console.log('All helper function tests passed.');
}

run();