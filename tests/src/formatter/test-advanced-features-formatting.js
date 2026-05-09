// Tests for advanced features formatting: annotation blocks, performs, stream/sink
const assert = require('assert');
const vscode = require('vscode');
const {formatThriftContent} = require('../../../out/formatter/formatter-core.js');

function run() {
    const options = {insertSpaces: true, indentSize: 4, tabSize: 4};

    // === Test 1: Top-level annotation block body content indented ===
    const topLevelAnnotation = `
@ServiceMetadata{
version = "1.0.0",
description = "Demo"
}
service Foo {
    string ping()
}`;
    let formatted = formatThriftContent(topLevelAnnotation, options);
    // Annotation body should be indented 4 spaces (1 level)
    assert.ok(
        formatted.includes('    version = "1.0.0"'),
        'Annotation body content should be indented 1 level (4 spaces)'
    );
    assert.ok(
        formatted.includes('    description = "Demo"'),
        'Annotation body second line should be indented 1 level'
    );
    // Annotation closing brace should be at same level as opening
    assert.ok(
        formatted.includes('\n}\n') || formatted.includes('\n}\r\n'),
        'Annotation closing brace should be at base indent level'
    );

    // === Test 2: Single-line annotation NOT affected ===
    const singleLineAnnotation = `
@namespace{"cpp": "thrift.test"}
service Foo {
    string ping()
}`;
    formatted = formatThriftContent(singleLineAnnotation, options);
    assert.ok(
        formatted.includes('@namespace{"cpp": "thrift.test"}'),
        'Single-line annotation should not be modified'
    );

    // === Test 3: Service-internal annotation block ===
    const internalAnnotation = `
service AdvancedService {
    string ping()

    @MethodMetadata{
    deprecated = false,
    timeout = 30000
    }
    stream<DataChunk> getDataStream(1: string query)

    interaction<Calculator> createCalculator(1: string sessionId)
}`;
    formatted = formatThriftContent(internalAnnotation, options);
    // Annotation body should be indented 8 spaces (service 1 + annotation 1)
    assert.ok(
        formatted.includes('        deprecated = false'),
        'Service-internal annotation body should be indented 2 levels (8 spaces)'
    );
    assert.ok(
        formatted.includes('        timeout = 30000'),
        'Service-internal annotation body second line should be indented 2 levels'
    );
    // Service should NOT be closed after annotation }
    assert.ok(
        formatted.includes('    stream<DataChunk> getDataStream'),
        'Service should still be active after annotation closing brace'
    );
    assert.ok(
        formatted.includes('    interaction<Calculator> createCalculator'),
        'Subsequent methods should be in service context'
    );

    // === Test 4: performs line recognized as service method ===
    const performsService = `
service DataService {
    performs Calculator calc
    performs DataProcessor processor
    string ping()
}`;
    formatted = formatThriftContent(performsService, options);
    assert.ok(
        formatted.includes('    performs Calculator calc'),
        'performs line should be indented at service level'
    );
    assert.ok(
        formatted.includes('    performs DataProcessor processor'),
        'Multiple performs lines should be indented correctly'
    );
    assert.ok(
        formatted.includes('    string ping()'),
        'Regular methods should still be formatted correctly'
    );

    // === Test 5: Top-level annotation block with interaction ===
    const topAnnotationWithInteraction = `
@InteractionMetadata{
stateful = true,
timeout = 60000
}
interaction StatefulCalculator {
    void reset()
    void setMemory(1: i64 value)
}`;
    formatted = formatThriftContent(topAnnotationWithInteraction, options);
    assert.ok(
        formatted.includes('    stateful = true'),
        'InteractionMetadata body should be indented 1 level'
    );
    assert.ok(
        formatted.includes('    timeout = 60000'),
        'InteractionMetadata body second line should be indented 1 level'
    );
    // Interaction body should be indented normally
    assert.ok(
        formatted.includes('    void reset()'),
        'Interaction method should be indented normally'
    );

    // === Test 6: Nested annotation blocks (edge case) ===
    const nestedAnnotation = `
@Outer{
@Inner{
key = "value"
}
}`;
    formatted = formatThriftContent(nestedAnnotation, options);
    // Outer body: 1 level
    // Inner annotation: 1 level (already inside)
    // Inner body: 2 levels
    assert.ok(
        formatted.includes('    @Inner{'),
        'Nested annotation start should be indented 1 level'
    );
    assert.ok(
        formatted.includes('        key = "value"'),
        'Nested annotation body should be indented 2 levels'
    );

    // === Test 7: Regression - stream sink types in formatting ===
    const streamService = `
service StreamService {
    stream<i32> uploadData(1: string sessionId)
    sink<LogEntry> collectLogs(1: string category)
}`;
    formatted = formatThriftContent(streamService, options);
    assert.ok(
        formatted.includes('    stream<i32> uploadData'),
        'stream return type should be formatted as service method'
    );
    assert.ok(
        formatted.includes('    sink<LogEntry> collectLogs'),
        'sink return type should be formatted as service method'
    );

    console.log('All advanced features formatting tests passed!');
}

describe('advanced-features-formatting', () => {
    it('should correctly format annotation blocks, performs, and stream/sink types', () => {
        run();
    });
});

module.exports = {run};

if (require.main === module) {
    run();
}
