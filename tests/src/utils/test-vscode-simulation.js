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

const {ThriftFormattingProvider} = require('../../../out/formatting-bridge/index.js');

function createMockDocument(content, filePath) {
    const uri = vscode.Uri.file(filePath);
    const doc = vscode.createTextDocument(content, uri);
    doc.languageId = 'thrift';
    doc.uri = uri;
    doc.lineCount = content.split('\n').length;
    return doc;
}

function findStructRange(lines, structName) {
    const startPattern = new RegExp(`\\bstruct\\s+${structName}\\s*\\{`);
    let start = -1;
    for (let i = 0; i < lines.length; i++) {
        const line = (lines[i] || '').trimEnd();
        if (startPattern.test(line)) {
            start = i;
            break;
        }
    }
    if (start === -1) return {start: -1, end: -1};
    let depth = 0;
    for (let i = start; i < lines.length; i++) {
        const line = lines[i] || '';
        for (let j = 0; j < line.length; j++) {
            const ch = line[j];
            if (ch === '{') depth++;
            else if (ch === '}') {
                depth--;
                if (depth === 0) {
                    return {start, end: i};
                }
            }
        }
    }
    return {start: -1, end: -1};
}

function runTest() {
    console.log('🔍 Testing VS Code formatting scenarios...\n');

    const formatter = new ThriftFormattingProvider();
    const examplePath = path.join(__dirname, '..', '..', 'test-files', 'example.thrift');
    const originalContent = fs.readFileSync(examplePath, 'utf8');

    console.log('📄 Test 1: Format entire document');
    console.log('='.repeat(50));

    const mockDoc1 = createMockDocument(originalContent, examplePath);
    const options = {insertSpaces: true, tabSize: 2};

    const edits1 = formatter.provideDocumentFormattingEdits(mockDoc1, options);
    if (!edits1 || edits1.length === 0) {
        console.error('❌ No edits returned for document formatting');
        process.exit(1);
    }

    const formattedContent = applyEditsToContent(originalContent, edits1);

    const originalLines = originalContent.split('\n');
    const formattedLines = formattedContent.split('\n');

    const origRange = findStructRange(originalLines, 'User');
    const formRange = findStructRange(formattedLines, 'User');

    console.log(`Original User struct: lines ${origRange.start + 1}-${origRange.end + 1}`);
    console.log(`Formatted User struct: lines ${formRange.start + 1}-${formRange.end + 1}`);

    const origUserLines = originalLines.slice(origRange.start, origRange.end + 1);
    const formUserLines = formattedLines.slice(formRange.start, formRange.end + 1);

    const origBlanks = [];
    const formBlanks = [];
    origUserLines.forEach((line, i) => {
        if (line.trim() === '') origBlanks.push(i + 1);
    });
    formUserLines.forEach((line, i) => {
        if (line.trim() === '') formBlanks.push(i + 1);
    });

    console.log(`Original blank positions: [${origBlanks.join(', ')}]`);
    console.log(`Formatted blank positions: [${formBlanks.join(', ')}]`);

    if (JSON.stringify(origBlanks) !== JSON.stringify(formBlanks)) {
        console.error('❌ Document formatting changed blank line positions!');

        console.log('\nDetailed User struct comparison:');
        const maxLen = Math.max(origUserLines.length, formUserLines.length);
        for (let i = 0; i < maxLen; i++) {
            const orig = i < origUserLines.length ? origUserLines[i] : '(missing)';
            const form = i < formUserLines.length ? formUserLines[i] : '(missing)';
            const origBlank = orig.trim() === '';
            const formBlank = form.trim() === '';

            if (origBlank !== formBlank) {
                console.log(`  Line ${i + 1}: ${origBlank ? 'BLANK' : 'TEXT'} -> ${formBlank ? 'BLANK' : 'TEXT'} ❌`);
            } else if (origBlank) {
                console.log(`  Line ${i + 1}: BLANK -> BLANK ✅`);
            }
        }
        process.exit(1);
    }

    console.log('✅ Document formatting preserves blank lines\n');

    console.log('📝 Test 2: Format selected range (lines 25-38)');
    console.log('='.repeat(50));

    const mockDoc2 = createMockDocument(originalContent, examplePath);
    const range = new vscode.Range(24, 0, 37, originalLines[37]?.length || 0);

    const edits2 = formatter.provideDocumentRangeFormattingEdits(mockDoc2, range, options);
    if (!edits2 || edits2.length === 0) {
        console.error('❌ No edits returned for range formatting');
        process.exit(1);
    }

    const rangeOriginalText = mockDoc2.getText(range);
    const localEdits2 = rebaseEditsToRange(edits2, range);
    const rangeFormattedText = applyEditsToContent(rangeOriginalText, localEdits2);

    const rangeOrigLines = rangeOriginalText.split('\n');
    const rangeFormLines = rangeFormattedText.split('\n');

    const rangeOrigBlanks = [];
    const rangeFormBlanks = [];
    rangeOrigLines.forEach((line, i) => {
        if (line.trim() === '') rangeOrigBlanks.push(i + 1);
    });
    rangeFormLines.forEach((line, i) => {
        if (line.trim() === '') rangeFormBlanks.push(i + 1);
    });

    console.log(`Range original blank positions: [${rangeOrigBlanks.join(', ')}]`);
    console.log(`Range formatted blank positions: [${rangeFormBlanks.join(', ')}]`);

    if (JSON.stringify(rangeOrigBlanks) !== JSON.stringify(rangeFormBlanks)) {
        console.error('❌ Range formatting changed blank line positions!');

        console.log('\nDetailed range comparison:');
        const maxRangeLen = Math.max(rangeOrigLines.length, rangeFormLines.length);
        for (let i = 0; i < maxRangeLen; i++) {
            const orig = i < rangeOrigLines.length ? rangeOrigLines[i] : '(missing)';
            const form = i < rangeFormLines.length ? rangeFormLines[i] : '(missing)';
            const origBlank = orig.trim() === '';
            const formBlank = form.trim() === '';

            if (origBlank !== formBlank) {
                console.log(`  Line ${i + 1}: ${origBlank ? 'BLANK' : 'TEXT'} -> ${formBlank ? 'BLANK' : 'TEXT'} ❌`);
            } else if (origBlank) {
                console.log(`  Line ${i + 1}: BLANK -> BLANK ✅`);
            }
        }
        process.exit(1);
    }

    console.log('✅ Range formatting preserves blank lines');
}

runTest();

function toOffsetsIndex(lines) {
    const offsets = new Array(lines.length + 1);
    let sum = 0;
    for (let i = 0; i < lines.length; i++) {
        offsets[i] = sum;
        sum += (lines[i]?.length || 0) + 1;
    }
    offsets[lines.length] = sum;
    return offsets;
}

function posToOffset(lines, offsets, line, character) {
    const clampedLine = Math.max(0, Math.min(line, lines.length - 1));
    const base = offsets[clampedLine] || 0;
    const maxChar = (lines[clampedLine]?.length || 0);
    const clampedChar = Math.max(0, Math.min(character || 0, maxChar));
    return base + clampedChar;
}

function applyEditsToContent(content, edits) {
    if (!edits || edits.length === 0) return content;
    const lines = content.split('\n');
    const offsets = toOffsetsIndex(lines);
    const expanded = edits.map(e => {
        const s = e.range.start || {line: 0, character: 0};
        const ed = e.range.end || {line: lines.length - 1, character: (lines[lines.length - 1]?.length || 0)};
        return {
            start: posToOffset(lines, offsets, s.line, s.character),
            end: posToOffset(lines, offsets, ed.line, ed.character),
            newText: e.newText || ''
        };
    });
    expanded.sort((a, b) => b.start - a.start);
    let result = content;
    for (const e of expanded) {
        result = result.slice(0, e.start) + e.newText + result.slice(e.end);
    }
    return result;
}

function rebaseEditsToRange(edits, baseRange) {
    const baseLine = baseRange.start?.line || 0;
    const baseChar = baseRange.start?.character || 0;
    return (edits || []).map(e => {
        const s = e.range.start;
        const ed = e.range.end;
        const startLine = (s.line - baseLine) < 0 ? 0 : (s.line - baseLine);
        const endLine = (ed.line - baseLine) < 0 ? 0 : (ed.line - baseLine);
        const startChar = s.line === baseLine ? Math.max(0, (s.character || 0) - baseChar) : (s.character || 0);
        const endChar = ed.line === baseLine ? Math.max(0, (ed.character || 0) - baseChar) : (ed.character || 0);
        return {
            range: new vscode.Range(startLine, startChar, endLine, endChar),
            newText: e.newText || ''
        };
    });
}
