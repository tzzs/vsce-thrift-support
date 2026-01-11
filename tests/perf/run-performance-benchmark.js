const {performance} = require('perf_hooks');

const {createVscodeMock, installVscodeMock} = require('../mock_vscode.js');

const vscode = createVscodeMock({
    window: {
        showErrorMessage: () => Promise.resolve(undefined)
    }
});
installVscodeMock(vscode);

const {DiagnosticManager} = require('../../out/diagnostics');
const {ThriftFormattingProvider} = require('../../out/formatting-bridge/index.js');
const {IncrementalTracker} = require('../../out/utils/incremental-tracker.js');
const {config} = require('../../out/config/index.js');

function parseArg(flag, fallback) {
    const idx = process.argv.indexOf(flag);
    if (idx === -1 || idx === process.argv.length - 1) {
        return fallback;
    }
    const value = Number(process.argv[idx + 1]);
    return Number.isFinite(value) ? value : fallback;
}

function generateLargeThrift(structCount, fieldCount) {
    const blocks = [];
    for (let i = 0; i < structCount; i += 1) {
        const fields = [];
        for (let j = 1; j <= fieldCount; j += 1) {
            fields.push(`  ${j}: i32 field_${i}_${j}`);
        }
        blocks.push(`struct Struct_${i} {\n${fields.join(';\n')};\n}`);
    }
    return blocks.join('\n\n');
}

function createDoc(text, name, version) {
    const uri = vscode.Uri.file(`/tmp/${name}`);
    const doc = vscode.createTextDocument(text, uri);
    doc.languageId = 'thrift';
    doc.uri = uri;
    doc.version = version;
    doc.lineCount = text.split('\n').length;
    return doc;
}

function updateLines(text, updates) {
    const lines = text.split('\n');
    updates.forEach(({line, value}) => {
        if (line >= 0 && line < lines.length) {
            lines[line] = value;
        }
    });
    return lines.join('\n');
}

async function measure(label, iterations, fn) {
    const durations = [];
    for (let i = 0; i < iterations; i += 1) {
        const start = performance.now();
        await fn();
        durations.push(performance.now() - start);
    }
    const total = durations.reduce((sum, value) => sum + value, 0);
    const avg = total / durations.length;
    const min = Math.min(...durations);
    const max = Math.max(...durations);
    console.log(`${label}: avg ${avg.toFixed(2)}ms (min ${min.toFixed(2)} / max ${max.toFixed(2)})`);
}

async function run() {
    console.log('\nRunning performance benchmark (diagnostics + formatting)...');

    const structCount = parseArg('--structs', 120);
    const fieldCount = parseArg('--fields', 30);
    const iterations = parseArg('--iterations', 10);

    const text = generateLargeThrift(structCount, fieldCount);
    const doc = createDoc(text, 'perf-benchmark.thrift', 1);

    const manager = new DiagnosticManager();
    const tracker = new IncrementalTracker();
    const formattingProvider = new ThriftFormattingProvider({incrementalTracker: tracker});

    config.incremental.analysisEnabled = true;
    config.incremental.formattingEnabled = true;
    config.incremental.maxDirtyLines = 5;

    await manager.performAnalysis(doc);

    await measure('Diagnostics (full)', iterations, async () => {
        doc.version += 1;
        await manager.performAnalysis(doc);
    });

    await measure('Diagnostics (incremental)', iterations, async () => {
        doc.version += 1;
        const updatedText = updateLines(text, [
            { line: 2, value: '  2: i32 field_0_2' },
            { line: Math.min(10, doc.lineCount - 2), value: '  1: i32 field_1_1' }
        ]);
        const updatedDoc = createDoc(updatedText, 'perf-benchmark.thrift', doc.version);
        manager.scheduleAnalysis(
            updatedDoc,
            true,
            false,
            'benchmark',
            2,
            false,
            { startLine: 2, endLine: 10 },
            false,
            [
                { startLine: 2, endLine: 2 },
                { startLine: Math.min(10, updatedDoc.lineCount - 2), endLine: Math.min(10, updatedDoc.lineCount - 2) }
            ]
        );
        await manager.performAnalysis(updatedDoc);
    });

    await measure('Formatting (full)', iterations, async () => {
        formattingProvider.provideDocumentFormattingEdits(doc, {insertSpaces: true, tabSize: 4});
    });

    await measure('Formatting (incremental)', iterations, async () => {
        tracker.markChanges({
            document: doc,
            contentChanges: [
                {
                    range: new vscode.Range(2, 0, 2, 0),
                    text: '  2: i32 field_0_2'
                }
            ]
        });
        formattingProvider.provideDocumentFormattingEdits(doc, {insertSpaces: true, tabSize: 4});
    });

    console.log('\nDone.');
}

run().catch((error) => {
    console.error('Benchmark failed:', error);
    process.exit(1);
});
