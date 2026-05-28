/**
 * Performance assertions for CI.
 * Runs formatter and parser against small/medium/large synthetic inputs,
 * asserts average times stay below thresholds.
 * Outputs JSON Lines for machine consumption.
 *
 * Usage:
 *   node -e "require('./tests/require-hook.js'); require('./tests/perf/perf-assertions.js')"
 *   # or via mocha (included in test suite)
 */
const {performance} = require('perf_hooks');
const assert = require('assert');

const {ThriftFormatter} = require('../../out/formatter');
const {ThriftParser} = require('../../out/ast/parser');
const {buildAstIndex} = require('../../out/formatter/ast-index');


const DEFAULT_OPTIONS = {
    trailingComma: 'preserve',
    alignTypes: true,
    alignFieldNames: true,
    alignStructDefaults: false,
    alignAnnotations: true,
    alignComments: true,
    alignEnumNames: true,
    alignEnumEquals: true,
    alignEnumValues: true,
    indentSize: 4,
    maxLineLength: 100,
    collectionStyle: 'preserve',
    insertSpaces: true,
    tabSize: 4
};

function generateThrift(structCount, fieldsPerStruct) {
    const blocks = [];
    for (let i = 0; i < structCount; i++) {
        const fields = [];
        for (let j = 1; j <= fieldsPerStruct; j++) {
            const type = j % 3 === 0 ? 'map<string, i32>' : j % 2 === 0 ? 'string' : 'i32';
            fields.push(`    ${j}: optional ${type} field_${i}_${j}, // comment ${j}`);
        }
        blocks.push(`// Struct ${i}\nstruct Struct_${i} {\n${fields.join('\n')}\n}`);
    }
    return `namespace cpp test\ninclude "shared.thrift"\n\n${blocks.join('\n\n')}`;
}

function measureSync(fn, iterations) {
    // Warmup
    for (let i = 0; i < 2; i++) {
        fn();
    }
    const durations = [];
    for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        fn();
        durations.push(performance.now() - start);
    }
    const sorted = [...durations].sort((a, b) => a - b);
    return {
        avg: durations.reduce((s, v) => s + v, 0) / durations.length,
        min: sorted[0],
        max: sorted[sorted.length - 1],
        p95: sorted[Math.floor(sorted.length * 0.95)],
        median: sorted[Math.floor(sorted.length / 2)]
    };
}

const SCENARIOS = [
    {name: 'small', structs: 10, fields: 5, thresholdFormatMs: 20, thresholdParseMs: 10},
    {name: 'medium', structs: 50, fields: 15, thresholdFormatMs: 100, thresholdParseMs: 50},
    {name: 'large', structs: 200, fields: 30, thresholdFormatMs: 500, thresholdParseMs: 200}
];

describe('Performance assertions', function () {
    this.timeout(120000);

    for (const scenario of SCENARIOS) {
        describe(`${scenario.name} (${scenario.structs} structs × ${scenario.fields} fields)`, () => {
            let content;
            let lineCount;

            before(() => {
                content = generateThrift(scenario.structs, scenario.fields);
                lineCount = content.split('\n').length;
            });

            it(`parser completes under ${scenario.thresholdParseMs}ms avg`, () => {
                const result = measureSync(() => {
                    const parser = new ThriftParser(content);
                    parser.parse();
                }, 5);

                console.log(JSON.stringify({
                    scenario: scenario.name,
                    operation: 'parse',
                    lines: lineCount,
                    ...result
                }));

                assert.ok(
                    result.avg < scenario.thresholdParseMs,
                    `Parser avg ${result.avg.toFixed(2)}ms exceeds ${scenario.thresholdParseMs}ms (${lineCount} lines)`
                );
            });

            it(`buildAstIndex completes quickly`, () => {
                const ast = new ThriftParser(content).parse();
                const result = measureSync(() => {
                    buildAstIndex(ast);
                }, 10);

                console.log(JSON.stringify({
                    scenario: scenario.name,
                    operation: 'buildAstIndex',
                    lines: lineCount,
                    ...result
                }));

                // AstIndex is O(n) in AST nodes; should be <5ms even for large
                assert.ok(
                    result.avg < 20,
                    `buildAstIndex avg ${result.avg.toFixed(2)}ms exceeds 20ms (${lineCount} lines)`
                );
            });

            it(`formatter completes under ${scenario.thresholdFormatMs}ms avg`, () => {
                const formatter = new ThriftFormatter();
                const result = measureSync(() => {
                    formatter.format(content, DEFAULT_OPTIONS);
                }, 5);

                console.log(JSON.stringify({
                    scenario: scenario.name,
                    operation: 'format',
                    lines: lineCount,
                    ...result
                }));

                assert.ok(
                    result.avg < scenario.thresholdFormatMs,
                    `Formatter avg ${result.avg.toFixed(2)}ms exceeds ${scenario.thresholdFormatMs}ms (${lineCount} lines)`
                );
            });
        });
    }
});
