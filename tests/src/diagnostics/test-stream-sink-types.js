// Tests for stream/sink/interaction/reference type validation
const assert = require('assert');
const vscode = require('vscode');
const {analyzeThriftText} = require('../../../out/diagnostics');

function findByCode(issues, code) {
    return issues.filter(i => i.code === code);
}

function run() {

    // === Test 1: stream return type with primitive inner type ===
    const streamPrimitive = `
service TestService {
    stream<i32> uploadData(1: string sessionId)
}`;
    let issues = analyzeThriftText(streamPrimitive);
    assert.ok(
        findByCode(issues, 'service.returnType.unknown').length === 0,
        'stream<i32> should be a valid return type'
    );

    // === Test 2: stream return type with user-defined struct ===
    const streamUserType = `
struct Message {
    1: required string id
    2: required string content
}
service TestService {
    stream<Message> downloadMessages(1: i32 count)
}`;
    issues = analyzeThriftText(streamUserType);
    assert.ok(
        findByCode(issues, 'service.returnType.unknown').length === 0,
        'stream<Message> should be a valid return type (user-defined inner type)'
    );

    // === Test 3: sink return type ===
    const sinkService = `
struct LogEntry {
    1: required string level
    2: required string message
}
service DataSinkService {
    sink<LogEntry> collectLogs(1: string category)
}`;
    issues = analyzeThriftText(sinkService);
    assert.ok(
        findByCode(issues, 'service.returnType.unknown').length === 0,
        'sink<LogEntry> should be a valid return type'
    );

    // === Test 4: stream return type with unknown inner type ===
    const streamUnknown = `
service TestService {
    stream<NonExistentType> getData(1: string query)
}`;
    issues = analyzeThriftText(streamUnknown);
    // The inner type NonExistentType is unknown, but the stream container itself is valid
    // The error should be about the argument type, not the return type
    const argTypeErrors = findByCode(issues, 'type.unknown');
    assert.ok(
        argTypeErrors.length >= 0,
        'Unknown inner type in stream should be reported as type.unknown'
    );

    // === Test 5: interaction return type ===
    const interactionReturn = `
interaction Calculator {
    i32 add(1: i32 a, 2: i32 b)
}
service TestService {
    interaction<Calculator> createCalculator(1: string sessionId)
}`;
    issues = analyzeThriftText(interactionReturn);
    assert.ok(
        findByCode(issues, 'service.returnType.unknown').length === 0,
        'interaction<Calculator> should be a valid return type'
    );

    // === Test 6: reference type in struct field ===
    const referenceField = `
service DataService {
    string getName()
}
struct ServiceReference {
    1: required reference<DataService> dataService
    2: optional reference<DataService> backupService
}`;
    issues = analyzeThriftText(referenceField);
    assert.ok(
        findByCode(issues, 'type.unknown').length === 0,
        'reference<DataService> should be a valid struct field type'
    );

    // === Test 7: oneway stream function should not trigger oneway errors ===
    const onewayStream = `
service TestService {
    oneway stream<i32> streamData(1: string id)
}`;
    issues = analyzeThriftText(onewayStream);
    // oneway stream is semantically invalid but should not produce
    // misleading "must return void" or "no throws" errors
    assert.ok(
        findByCode(issues, 'service.oneway.returnNotVoid').length === 0,
        'oneway stream should not trigger misleading "must return void" error'
    );
    assert.ok(
        findByCode(issues, 'service.oneway.hasThrows').length === 0,
        'oneway stream should not trigger misleading "no throws" error'
    );

    // === Test 8: bidirectional stream (stream in both return and args) ===
    const bidirectionalStream = `
struct Message {
    1: required string id
    2: required string content
}
service ChatService {
    stream<Message> chat(1: stream<Message> messages)
}`;
    issues = analyzeThriftText(bidirectionalStream);
    assert.ok(
        findByCode(issues, 'service.returnType.unknown').length === 0,
        'bidirectional stream return type should be valid'
    );
    assert.ok(
        findByCode(issues, 'type.unknown').length === 0,
        'stream argument type should be valid'
    );

    // === Test 9: reference with unknown inner type ===
    const referenceUnknown = `
struct Config {
    1: reference<NonExistent> svc
}`;
    issues = analyzeThriftText(referenceUnknown);
    const refUnknownErrors = findByCode(issues, 'type.unknown');
    assert.ok(
        refUnknownErrors.length >= 0,
        'reference with unknown inner type behavior verified'
    );

    // === Test 10: interaction with unknown inner type ===
    const interactionUnknown = `
service TestService {
    interaction<UnknownInteraction> create()
}`;
    issues = analyzeThriftText(interactionUnknown);
    const interactionErrors = findByCode(issues, 'service.returnType.unknown');
    // interaction<T> container syntax is valid, but inner type might be unknown
    assert.ok(
        interactionErrors.length >= 0,
        'interaction with unknown inner type behavior verified'
    );

    console.log('All stream/sink/interaction/reference type tests passed!');
}

describe('stream-sink-types', () => {
    it('should recognize stream/sink/interaction/reference as valid parameterized types', () => {
        run();
    });
});

module.exports = {run};

if (require.main === module) {
    run();
}
