const fs = require('fs');
const path = require('path');

const {createVscodeMock, installVscodeMock} = require('../../mock_vscode.js');

const vscode = createVscodeMock({
    TextEdit: {replace: (range, text) => ({range, newText: text})},
    workspace: {
        getConfiguration: (_section) => ({get: (_key, def) => def})
    }
});
installVscodeMock(vscode);

const {ThriftFormattingProvider} = require('../../../out/formatting-provider.js');

function runTest() {
    const formatter = new ThriftFormattingProvider();

    const examplePath = path.join(__dirname, '..', '..', '..', 'test-files', 'example.thrift');
    const fullInput = fs.readFileSync(examplePath, 'utf8');

    console.log('Testing full file formatting...');

    const inputLines = fullInput.split('\n');
    let userStructStart = -1;
    let userStructEnd = -1;

    for (let i = 0; i < inputLines.length; i++) {
        if (inputLines[i].includes('struct User {')) {
            userStructStart = i;
        }
        if (userStructStart >= 0 && inputLines[i].trim() === '}' && inputLines[i - 1].includes('avatar')) {
            userStructEnd = i;
            break;
        }
    }

    console.log(`User struct found at lines ${userStructStart + 1}-${userStructEnd + 1}`);

    console.log('\nOriginal User struct:');
    for (let i = userStructStart; i <= userStructEnd; i++) {
        const line = inputLines[i];
        console.log(`Line ${i + 1}: "${line}" ${line.trim() === '' ? '(BLANK)' : ''}`);
    }

    const uri = vscode.Uri.file(examplePath);
    const doc = vscode.createTextDocument(fullInput, uri);
    doc.languageId = 'thrift';
    doc.uri = uri;
    doc.lineCount = inputLines.length;

    const edits = formatter.provideDocumentFormattingEdits(doc, {insertSpaces: true, tabSize: 2});
    if (!edits || edits.length === 0) {
        console.error('No edits returned');
        process.exit(1);
    }
    const output = edits[0].newText;

    const outputLines = output.split('\n');
    let outputUserStructStart = -1;
    let outputUserStructEnd = -1;

    for (let i = 0; i < outputLines.length; i++) {
        if (outputLines[i].includes('struct User {')) {
            outputUserStructStart = i;
        }
        if (outputUserStructStart >= 0 && outputLines[i].trim() === '}' && outputLines[i - 1].includes('avatar')) {
            outputUserStructEnd = i;
            break;
        }
    }

    console.log(`\nFormatted User struct found at lines ${outputUserStructStart + 1}-${outputUserStructEnd + 1}`);

    console.log('\nFormatted User struct:');
    for (let i = outputUserStructStart; i <= outputUserStructEnd; i++) {
        const line = outputLines[i];
        console.log(`Line ${i + 1}: "${line}" ${line.trim() === '' ? '(BLANK)' : ''}`);
    }

    const originalUserLines = inputLines.slice(userStructStart, userStructEnd + 1);
    const formattedUserLines = outputLines.slice(outputUserStructStart, outputUserStructEnd + 1);

    const originalBlankPositions = [];
    const formattedBlankPositions = [];

    for (let i = 0; i < originalUserLines.length; i++) {
        if (originalUserLines[i].trim() === '') {
            originalBlankPositions.push(i + 1);
        }
    }

    for (let i = 0; i < formattedUserLines.length; i++) {
        if (formattedUserLines[i].trim() === '') {
            formattedBlankPositions.push(i + 1);
        }
    }

    console.log(`\nOriginal User struct blank line positions: [${originalBlankPositions.join(', ')}]`);
    console.log(`Formatted User struct blank line positions: [${formattedBlankPositions.join(', ')}]`);

    if (JSON.stringify(originalBlankPositions) !== JSON.stringify(formattedBlankPositions)) {
        console.error('❌ Blank line positions changed in User struct after full file formatting');

        console.log('\nDetailed User struct comparison:');
        const maxLines = Math.max(originalUserLines.length, formattedUserLines.length);
        for (let i = 0; i < maxLines; i++) {
            const origLine = i < originalUserLines.length ? originalUserLines[i] : '(missing)';
            const formLine = i < formattedUserLines.length ? formattedUserLines[i] : '(missing)';
            const origBlank = origLine.trim() === '';
            const formBlank = formLine.trim() === '';

            if (origBlank !== formBlank) {
                console.log(`Struct Line ${i + 1}: ORIGINAL ${origBlank ? 'BLANK' : 'NON-BLANK'} -> FORMATTED ${formBlank ? 'BLANK' : 'NON-BLANK'} ❌`);
            } else if (origBlank && formBlank) {
                console.log(`Struct Line ${i + 1}: Both BLANK ✅`);
            }
        }

        process.exit(1);
    }

    console.log('✅ Full file formatting preserves User struct blank lines correctly');

    const outputPath = path.join(__dirname, '..', '..', '..', 'test-files', 'example-formatted.thrift');
    fs.writeFileSync(outputPath, output, 'utf8');
    console.log(`\nFormatted output written to: ${outputPath}`);
}

runTest();
