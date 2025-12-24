// Diagnostics unit tests (Node environment with vscode mock)
const assert = require('assert');
const Module = require('module');
const originalRequire = Module.prototype.require;

// Minimal vscode mock to satisfy diagnostics module
const vscode = {
    DiagnosticSeverity: {
        Error: 0,
        Warning: 1,
        Information: 2,
        Hint: 3,
    },
    Position: function (line, character) {
        return {line, character};
    },
    Range: function (startLine, startChar, endLine, endChar) {
        return {start: {line: startLine, character: startChar}, end: {line: endLine, character: endChar}};
    },
};

Module.prototype.require = function (id) {
    if (id === 'vscode') return vscode;
    return originalRequire.apply(this, arguments);
};

const {analyzeThriftText} = require('../out/src/diagnostics.js');
Module.prototype.require = originalRequire;

function findByCode(issues, code) {
    return issues.filter(i => i.code === code);
}

function run() {
    console.log('\nRunning diagnostics tests...');

    // 1) Duplicate field id within a struct
    const dupId = `struct Foo {\n  1: i32 id,\n  1: i64 id2,\n}`;
    let issues = analyzeThriftText(dupId);
    assert.ok(findByCode(issues, 'field.duplicateId').length === 1, 'Expected one duplicate id error');

    // Field ids reset across structs
    const twoStructs = `struct A {\n  1: i32 x\n}\n\nstruct B {\n  1: i64 y\n}`;
    issues = analyzeThriftText(twoStructs);
    assert.ok(findByCode(issues, 'field.duplicateId').length === 0, 'Field ids should reset per type block');

    // 2) Unknown field type
    const unknownType = `struct Bar {\n  1: FooType name\n}`;
    issues = analyzeThriftText(unknownType);
    assert.ok(findByCode(issues, 'type.unknown').length === 1, 'Unknown type should be flagged');

    // 3) Unknown typedef base type
    const badTypedef = `typedef UnknownBase GoodName`;
    issues = analyzeThriftText(badTypedef);
    assert.ok(findByCode(issues, 'typedef.unknownBase').length === 1, 'Unknown typedef base should be flagged');

    // 4) Container types validate inner types
    const badContainer = `struct C {\n  1: list<UnknownInner> xs\n}`;
    issues = analyzeThriftText(badContainer);
    assert.ok(findByCode(issues, 'type.unknown').length === 1, 'Unknown inner container type should be flagged');

    // 5) Unmatched closer
    const unmatchedCloser = `}`;
    issues = analyzeThriftText(unmatchedCloser);
    assert.ok(findByCode(issues, 'syntax.unmatchedCloser').length === 1, 'Unmatched closer should be flagged');

    // 6) Unclosed opener
    const unclosedOpener = `{`;
    issues = analyzeThriftText(unclosedOpener);
    assert.ok(findByCode(issues, 'syntax.unclosed').length === 1, 'Unclosed opener should be flagged');

    // 7) Enum value must be integer (negative values now allowed)
    const enumBad = `enum E {\n  A = -1,\n  B = 1.1,\n  C = 2,\n}`;
    issues = analyzeThriftText(enumBad);
    assert.ok(findByCode(issues, 'enum.negativeValue').length === 0, 'Enum negative values should now be allowed');
    assert.ok(findByCode(issues, 'enum.valueNotInteger').length === 1, 'Enum non-integer value should be flagged');

    // 8) Default value type mismatch (uuid format and others)
    const defaults = `struct D {\n  1: uuid id = "not-a-uuid"\n  2: string s = 123\n  3: i32 n = "x"\n  4: double d = 1.23\n  5: bool b = true\n  6: uuid u2 = "123e4567-e89b-12d3-a456-426614174000"\n}`;
    issues = analyzeThriftText(defaults);
    assert.ok(findByCode(issues, 'value.typeMismatch').length >= 2, 'Should flag mismatched default types (uuid and others)');

    // 9) Service oneway must return void and cannot have throws
    const svcOneway = `service S {\n  oneway void ping(),\n  oneway i32 bad1(),\n  oneway void bad2() throws (1: exception E ex)\n}\nexception E {\n  1: string msg\n}`;
    issues = analyzeThriftText(svcOneway);
    assert.ok(findByCode(issues, 'service.oneway.returnNotVoid').length === 1, 'oneway non-void should be flagged');
    assert.ok(findByCode(issues, 'service.oneway.hasThrows').length === 1, 'oneway throws should be flagged');

    // 10) Service throws unknown and not-exception types
    const svcThrows = `exception X { 1: string m }\nstruct Y { 1: string m }\nservice S2 {\n  void f() throws (1: X ex, 2: Y notEx)\n}`;
    issues = analyzeThriftText(svcThrows);
    assert.ok(findByCode(issues, 'service.throws.notException').length === 1, 'throws non-exception should be flagged');

    const svcThrowsUnknown = `service S3 {\n  void f() throws (1: UnknownEx ex)\n}`;
    issues = analyzeThriftText(svcThrowsUnknown);
    assert.ok(findByCode(issues, 'service.throws.unknown').length === 1, 'throws unknown type should be flagged');

    // 11) Service extends checks
    const svcExt = `service P {}\nstruct Z {}\nservice C extends P {}\nservice C2 extends Z {}`;
    issues = analyzeThriftText(svcExt);
    assert.ok(findByCode(issues, 'service.extends.notService').length === 1, 'extends non-service should be flagged');

    const svcExtUnknown = `service C3 extends Unknown {}\n`;
    issues = analyzeThriftText(svcExtUnknown);
    assert.ok(findByCode(issues, 'service.extends.unknown').length === 1, 'extends unknown should be flagged');

    // 12) '=' inside field annotations must NOT be treated as a default value
    const annotEq = `struct U {\n  1: required string name (go.tag='json:\"name\"'),\n}`;
    issues = analyzeThriftText(annotEq);
    assert.ok(findByCode(issues, 'value.typeMismatch').length === 0, "Equals inside annotations shouldn't create a default value error");

    // 13) set<T> default value using [] should be accepted (lenient)
    const setDefaultBracket = [
        'struct OptionalSetDefaultTest {',
        '  1: optional set<string> with_default = [ "test" ]',
        '}'
    ].join('\n');
    issues = analyzeThriftText(setDefaultBracket);
    assert.strictEqual(findByCode(issues, 'value.typeMismatch').length, 0, 'should not flag type mismatch for set defaults with []');

    console.log('All diagnostics tests passed.');
}

run();
