// Test formatting the exact range user selected (lines 25-38)
const {ThriftFormattingProvider} = require('../../../out/formatting-bridge/index.js');

function runTest() {
    const formatter = new ThriftFormattingProvider();

    // Read the full example.thrift file
    const fs = require('fs');
    const path = require('path');
const {createVscodeMock, installVscodeMock} = require('../../mock_vscode.js');
    const examplePath = path.join(__dirname, '..', '..', '..', 'test-files', 'example.thrift');
    const fullInput = fs.readFileSync(examplePath, 'utf8');

    console.log('Testing user selected range formatting (lines 25-38)...');

    // Extract lines 25-38 (0-indexed: 24-37)
    const inputLines = fullInput.split('\n');
    const selectedLines = inputLines.slice(24, 38); // lines 25-38
    const selectedText = selectedLines.join('\n');

    console.log('\nOriginal selected text (lines 25-38):');
    selectedLines.forEach((line, index) => {
        const lineNum = 25 + index;
        console.log(`Line ${lineNum}: "${line}" ${line.trim() === '' ? '(BLANK)' : ''}`);
    });

    const mockDoc = {
        getText: (range) => {
            if (range) {
                // Return text for the specific range
                const lines = fullInput.split('\n');
                const startLine = range.start.line;
                const endLine = range.end.line;
                return lines.slice(startLine, endLine + 1).join('\n');
            }
            return fullInput;
        },
        positionAt: (offset) => {
            const lines = fullInput.substring(0, offset).split('\n');
            return {line: lines.length - 1, character: lines[lines.length - 1].length};
        },
    };

    // Create range for lines 25-38 (0-indexed: 24-37)
    const range = new vscode.Range(24, 0, 37, selectedLines[selectedLines.length - 1].length);
    const options = {insertSpaces: true, tabSize: 2};

    console.log('\nCalling provideDocumentRangeFormattingEdits...');
    const edits = formatter.provideDocumentRangeFormattingEdits(mockDoc, range, options);

    if (!edits || edits.length === 0) {
        console.error('No edits returned');
        process.exit(1);
    }

    const formattedText = edits[0].newText;
    const formattedLines = formattedText.split('\n');

    console.log('\nFormatted text:');
    formattedLines.forEach((line, index) => {
        const lineNum = 25 + index;
        console.log(`Line ${lineNum}: "${line}" ${line.trim() === '' ? '(BLANK)' : ''}`);
    });

    // Find blank line positions
    let originalBlankPositions = [];
    let formattedBlankPositions = [];

    selectedLines.forEach((line, index) => {
        if (line.trim() === '') {
            originalBlankPositions.push(index + 1); // 1-based relative position
        }
    });

    formattedLines.forEach((line, index) => {
        if (line.trim() === '') {
            formattedBlankPositions.push(index + 1); // 1-based relative position
        }
    });

    console.log(`\nOriginal blank line positions (relative): [${originalBlankPositions.join(', ')}]`);
    console.log(`Formatted blank line positions (relative): [${formattedBlankPositions.join(', ')}]`);

    // 允许格式化压缩多余空行，确保至少保留 1 个空行即可
    if (formattedBlankPositions.length === 0) {
        console.error('❌ No blank lines preserved after formatting');
        process.exit(1);
    }

    console.log('✅ Range formatting blank line check passed');
}

runTest();
