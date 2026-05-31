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
const {buildSemanticTokensFromAst} = require('../../out/semantic-tokens-provider');
const {WorkspaceIndex} = require('../../out/indexing/workspace-index');
const {buildServiceIndex} = require('../../out/call-hierarchy-provider');
const {buildTypeHierarchyIndex} = require('../../out/type-hierarchy-provider');
const vscode = require('../mock_vscode');


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

async function measureAsync(fn, iterations) {
    for (let i = 0; i < 2; i++) {
        await fn();
    }
    const durations = [];
    for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        await fn();
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

function generateWorkspaceFiles(fileCount, servicesPerFile, methodsPerService) {
    const files = new Map();
    for (let fileIndex = 0; fileIndex < fileCount; fileIndex += 1) {
        const parts = [`namespace js perf${fileIndex}`];
        if (fileIndex > 0) {
            parts.push('include "file_0.thrift"');
        }
        parts.push(`struct Shared_${fileIndex} {`);
        for (let field = 1; field <= 8; field += 1) {
            parts.push(`    ${field}: string value_${field}`);
        }
        parts.push('}');
        for (let serviceIndex = 0; serviceIndex < servicesPerFile; serviceIndex += 1) {
            const serviceName = `Service_${fileIndex}_${serviceIndex}`;
            const parent = fileIndex > 0 && serviceIndex === 0 ? ' extends Service_0_0' : '';
            parts.push(`service ${serviceName}${parent} {`);
            for (let method = 0; method < methodsPerService; method += 1) {
                parts.push(`    Shared_${fileIndex} method_${method}(1: Shared_${fileIndex} input)`);
            }
            parts.push('}');
        }
        files.set(`/workspace/file_${fileIndex}.thrift`, `${parts.join('\n')}\n`);
    }
    return files;
}

function parseWorkspaceDocs(files) {
    return Array.from(files.entries()).map(([file, content]) => ({
        uri: vscode.Uri.file(file),
        ast: new ThriftParser(content).parse()
    }));
}

const SCENARIOS = [
    {name: 'small', structs: 10, fields: 5, thresholdFormatMs: 20, thresholdParseMs: 10},
    {name: 'medium', structs: 50, fields: 15, thresholdFormatMs: 100, thresholdParseMs: 50},
    {name: 'large', structs: 200, fields: 30, thresholdFormatMs: 500, thresholdParseMs: 200}
];

const SEMANTIC_TOKEN_SCENARIOS = [
    {name: 'semantic-500-lines', structs: 22, fields: 20, thresholdMs: 20},
    {name: 'semantic-1000-lines', structs: 44, fields: 20, thresholdMs: 40}
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

    describe('semantic tokens', () => {
        for (const scenario of SEMANTIC_TOKEN_SCENARIOS) {
            it(`${scenario.name} completes under ${scenario.thresholdMs}ms avg`, () => {
                const content = generateThrift(scenario.structs, scenario.fields);
                const lineCount = content.split('\n').length;
                const ast = new ThriftParser(content).parse();
                const result = measureSync(() => {
                    buildSemanticTokensFromAst(ast);
                }, 10);

                console.log(JSON.stringify({
                    scenario: scenario.name,
                    operation: 'semanticTokens',
                    lines: lineCount,
                    ...result
                }));

                assert.ok(
                    result.avg < scenario.thresholdMs,
                    `Semantic tokens avg ${result.avg.toFixed(2)}ms exceeds ${scenario.thresholdMs}ms (${lineCount} lines)`
                );
            });
        }
    });

    describe('workspace index and hierarchy providers', () => {
        it('workspace index refresh completes under 120ms avg for 80 files', async () => {
            const files = generateWorkspaceFiles(80, 2, 4);
            const uris = Array.from(files.keys()).map(file => vscode.Uri.file(file));
            const index = new WorkspaceIndex({
                findFiles: async () => uris,
                readFile: async uri => files.get(uri.fsPath) || ''
            });

            const result = await measureAsync(async () => {
                await index.refresh();
            }, 5);

            console.log(JSON.stringify({
                scenario: 'workspace-index-80-files',
                operation: 'workspaceIndexRefresh',
                files: files.size,
                symbols: index.getAllSymbols().length,
                ...result
            }));

            assert.ok(
                result.avg < 120,
                `WorkspaceIndex refresh avg ${result.avg.toFixed(2)}ms exceeds 120ms (${files.size} files)`
            );
        });

        it('hierarchy projection indexes complete under 50ms avg for 80 files', () => {
            const files = generateWorkspaceFiles(80, 2, 4);
            const docs = parseWorkspaceDocs(files);
            const result = measureSync(() => {
                buildTypeHierarchyIndex(docs);
                buildServiceIndex(docs);
            }, 10);

            console.log(JSON.stringify({
                scenario: 'hierarchy-projection-80-files',
                operation: 'hierarchyProjectionIndexes',
                files: files.size,
                ...result
            }));

            assert.ok(
                result.avg < 50,
                `Hierarchy projection avg ${result.avg.toFixed(2)}ms exceeds 50ms (${files.size} files)`
            );
        });

        it('workspace index invalidate and dispose clear indexed state', async () => {
            const files = generateWorkspaceFiles(60, 2, 4);
            const uris = Array.from(files.keys()).map(file => vscode.Uri.file(file));
            const index = new WorkspaceIndex({
                findFiles: async () => uris,
                readFile: async uri => files.get(uri.fsPath) || ''
            });

            await index.refresh();
            assert.ok(index.getAllFiles().length > 0);
            assert.ok(index.getAllSymbols().length > 0);

            index.invalidate(uris[0]);
            assert.strictEqual(index.getAllFiles().length, files.size - 1);

            index.dispose();
            assert.strictEqual(index.getAllFiles().length, 0);
            assert.strictEqual(index.getAllSymbols().length, 0);
        });
    });
});
