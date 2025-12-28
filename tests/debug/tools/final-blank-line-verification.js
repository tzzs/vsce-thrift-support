// Final verification of blank line behavior
const {ThriftFormattingProvider} = require('../out/formattingProvider.js');
Module.prototype.require = originalRequire;

function runFinalVerification() {
    console.log('🔍 Final Blank Line Position Verification\n');
    console.log('='.repeat(60));

    const formatter = new ThriftFormattingProvider();
    const fs = require('fs');
    const path = require('path');
const {createVscodeMock, installVscodeMock} = require('../../mock_vscode.js');
    const examplePath = path.join(__dirname, '..', 'test-files', 'example.thrift');
    const originalContent = fs.readFileSync(examplePath, 'utf8');

    const mockDoc = {
        getText: () => originalContent,
        positionAt: (offset) => {
            const lines = originalContent.substring(0, offset).split('\n');
            return {line: lines.length - 1, character: lines[lines.length - 1].length};
        },
    };

    const options = {insertSpaces: true, tabSize: 2};
    const edits = formatter.provideDocumentFormattingEdits(mockDoc, options);

    if (!edits || edits.length === 0) {
        console.error('❌ No edits returned');
        process.exit(1);
    }

    const formattedContent = edits[0].newText;

    // Extract User struct from both versions
    const originalLines = originalContent.split('\n');
    const formattedLines = formattedContent.split('\n');

    console.log('📋 ORIGINAL User struct:');
    let origUserStart = -1, origUserEnd = -1;
    for (let i = 0; i < originalLines.length; i++) {
        if (originalLines[i].includes('struct User {')) {
            origUserStart = i;
            break;
        }
    }
    for (let i = origUserStart + 1; i < originalLines.length; i++) {
        if (originalLines[i].trim() === '}') {
            origUserEnd = i;
            break;
        }
    }

    for (let i = origUserStart; i <= origUserEnd; i++) {
        const line = originalLines[i];
        const isBlank = line.trim() === '';
        const relativePos = i - origUserStart + 1;
        console.log(`  Struct Line ${relativePos}: "${line}" ${isBlank ? '(BLANK)' : ''}`);
    }

    console.log('\n📋 FORMATTED User struct:');
    let formUserStart = -1, formUserEnd = -1;
    for (let i = 0; i < formattedLines.length; i++) {
        if (formattedLines[i].includes('struct User {')) {
            formUserStart = i;
            break;
        }
    }
    for (let i = formUserStart + 1; i < formattedLines.length; i++) {
        if (formattedLines[i].trim() === '}') {
            formUserEnd = i;
            break;
        }
    }

    for (let i = formUserStart; i <= formUserEnd; i++) {
        const line = formattedLines[i];
        const isBlank = line.trim() === '';
        const relativePos = i - formUserStart + 1;
        console.log(`  Struct Line ${relativePos}: "${line}" ${isBlank ? '(BLANK)' : ''}`);
    }

    // Compare blank line positions within struct
    const origUserLines = originalLines.slice(origUserStart, origUserEnd + 1);
    const formUserLines = formattedLines.slice(formUserStart, formUserEnd + 1);

    let origBlanks = [], formBlanks = [];
    origUserLines.forEach((line, i) => {
        if (line.trim() === '') origBlanks.push(i + 1);
    });
    formUserLines.forEach((line, i) => {
        if (line.trim() === '') formBlanks.push(i + 1);
    });

    console.log('\n📊 COMPARISON RESULTS:');
    console.log(`Original struct blank line positions: [${origBlanks.join(', ')}]`);
    console.log(`Formatted struct blank line positions: [${formBlanks.join(', ')}]`);

    if (JSON.stringify(origBlanks) === JSON.stringify(formBlanks)) {
        console.log('✅ BLANK LINE POSITIONS PRESERVED CORRECTLY');
        console.log('   The formatter maintains blank lines in their original relative positions within the struct.');
    } else {
        console.log('❌ BLANK LINE POSITIONS CHANGED');
        console.log('   This confirms the user\'s reported issue!');

        console.log('\n🔍 Detailed Analysis:');
        const maxLen = Math.max(origUserLines.length, formUserLines.length);
        for (let i = 0; i < maxLen; i++) {
            const orig = i < origUserLines.length ? origUserLines[i] : '(missing)';
            const form = i < formUserLines.length ? formUserLines[i] : '(missing)';
            const origBlank = orig.trim() === '';
            const formBlank = form.trim() === '';

            if (origBlank !== formBlank) {
                console.log(`  Struct Line ${i + 1}: ${origBlank ? 'BLANK' : 'TEXT'} -> ${formBlank ? 'BLANK' : 'TEXT'} ❌`);
            } else if (origBlank && formBlank) {
                console.log(`  Struct Line ${i + 1}: BLANK -> BLANK ✅`);
            }
        }

        return false;
    }

    return true;
}

const success = runFinalVerification();
process.exit(success ? 0 : 1);
