// Mock vscode module to run formatter without VS Code
const {ThriftFormattingProvider} = require('../../../out/formattingProvider.js');
Module.prototype.require = originalRequire;

function runTest() {
    const formatter = new ThriftFormattingProvider();

    // Read the actual example.thrift file
    const fs = require('fs');
    const path = require('path');
const {createVscodeMock, installVscodeMock} = require('../../mock_vscode.js');
    const examplePath = path.join(__dirname, '..', '..', '..', 'test-files', 'example.thrift');
    const fullInput = fs.readFileSync(examplePath, 'utf8');

    // Extract exactly lines 25-38 (1-based indexing)
    const lines = fullInput.split('\n');
    const input = lines.slice(24, 38).join('\n'); // 0-based, so 24-37 for lines 25-38

    console.log('Testing lines 25-38 blank line preservation...');
    console.log('Input (lines 25-38):');
    console.log(input);
    console.log('---');
    console.log('Line by line analysis:');
    const inputLines = input.split('\n');
    inputLines.forEach((line, idx) => {
        console.log(`Line ${idx + 1}: "${line}" ${line.trim() === '' ? '(BLANK)' : ''}`);
    });
    console.log('---');

    const mockDoc = {
        getText: () => input,
    };
    const fullRange = {start: {line: 0, character: 0}, end: {line: 9999, character: 0}};
    const options = {insertSpaces: true, tabSize: 2};

    const edits = formatter.provideDocumentRangeFormattingEdits(mockDoc, fullRange, options);
    if (!edits || edits.length === 0) {
        console.error('No edits returned');
        process.exit(1);
    }
    const output = edits[0].newText;

    console.log('Formatted output:');
    console.log(output);
    console.log('---');
    console.log('Output line by line analysis:');
    const outputLines = output.split('\n');
    outputLines.forEach((line, idx) => {
        console.log(`Line ${idx + 1}: "${line}" ${line.trim() === '' ? '(BLANK)' : ''}`);
    });
    console.log('---');

    // Normalize line endings
    const normalize = (s) => s
        .replace(/\r\n/g, '\n')
        .replace(/[ \t]+(?=\n)/g, '');

    const inputN = normalize(input);
    const outputN = normalize(output);

    // Check blank line positions
    const inputLinesN = inputN.split('\n');
    const outputLinesN = outputN.split('\n');

    let inputBlankPositions = [];
    let outputBlankPositions = [];

    for (let i = 0; i < inputLinesN.length; i++) {
        if (inputLinesN[i].trim() === '') {
            inputBlankPositions.push(i + 1); // 1-based for readability
        }
    }

    for (let i = 0; i < outputLinesN.length; i++) {
        if (outputLinesN[i].trim() === '') {
            outputBlankPositions.push(i + 1); // 1-based for readability
        }
    }

    console.log(`Input blank line positions: [${inputBlankPositions.join(', ')}]`);
    console.log(`Output blank line positions: [${outputBlankPositions.join(', ')}]`);

    if (JSON.stringify(inputBlankPositions) !== JSON.stringify(outputBlankPositions)) {
        console.error('❌ Blank line positions changed after formatting');
        console.log('This confirms the blank line preservation issue exists');

        // Show detailed comparison
        console.log('\nDetailed comparison:');
        const maxLines = Math.max(inputLinesN.length, outputLinesN.length);
        for (let i = 0; i < maxLines; i++) {
            const inputLine = i < inputLinesN.length ? inputLinesN[i] : '(missing)';
            const outputLine = i < outputLinesN.length ? outputLinesN[i] : '(missing)';
            const inputBlank = inputLine.trim() === '';
            const outputBlank = outputLine.trim() === '';

            if (inputBlank !== outputBlank) {
                console.log(`Line ${i + 1}: INPUT ${inputBlank ? 'BLANK' : 'NON-BLANK'} -> OUTPUT ${outputBlank ? 'BLANK' : 'NON-BLANK'} ❌`);
            }
        }

        process.exit(1);
    }

    console.log('✅ Lines 25-38 blank line preservation test PASSED');
}

runTest();
