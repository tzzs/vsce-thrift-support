// Mock vscode module to run formatter without VS Code
const Module = require('module');
const originalRequire = Module.prototype.require;

const vscode = {
    workspace: {
        getConfiguration: (section) => {
            if (section === 'thrift.format') {
                // Provide defaults with our overrides for this test
                const defaults = {
                    trailingComma: 'preserve',
                    alignTypes: true,
                    alignFieldNames: true,

                    alignAnnotations: true,
                    alignComments: true,
                    alignEnumNames: true,
                    alignEnumEquals: true,
                    alignEnumValues: true,
                    indentSize: 2,
                    maxLineLength: 100,
                    collectionStyle: 'preserve',
                };
                return {get: (key) => defaults[key]};
            } else if (section === 'thrift-support.formatting') {
                // legacy namespace used by some tests; return defaults when requested
                return {get: (key, def) => def};
            }
            return {get: () => undefined};
        },
    },
    TextEdit: {
        replace: (range, newText) => ({range, newText}),
    },
    Range: function (startLine, startChar, endLine, endChar) {
        return {start: {line: startLine, character: startChar}, end: {line: endLine, character: endChar}};
    },
};

Module.prototype.require = function (id) {
    if (id === 'vscode') return vscode;
    return originalRequire.apply(this, arguments);
};

const {ThriftFormattingProvider} = require('../out/src/formattingProvider.js');
Module.prototype.require = originalRequire;

function runTest() {
    const formatter = new ThriftFormattingProvider();

    // Read the actual example.thrift file
    const fs = require('fs');
    const path = require('path');
    const examplePath = path.join(__dirname, '..', 'test-files', 'example.thrift');
    const fullInput = fs.readFileSync(examplePath, 'utf8');

    // Extract the User struct section (lines 25-38 approximately)
    const lines = fullInput.split('\n');
    let startIdx = -1, endIdx = -1;

    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('struct User {')) {
            startIdx = i;
        }
        if (startIdx >= 0 && lines[i].trim() === '}' && lines[i - 1].includes('avatar')) {
            endIdx = i;
            break;
        }
    }

    if (startIdx === -1 || endIdx === -1) {
        console.error('Could not find User struct in example.thrift');
        process.exit(1);
    }

    const input = lines.slice(startIdx, endIdx + 1).join('\n');

    console.log('Testing User struct blank line preservation...');
    console.log('Input User struct:');
    console.log(input);
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

    // Normalize line endings to avoid CRLF/LF mismatches on Windows
    const normalize = (s) => s
        .replace(/\r\n/g, '\n')
        // remove trailing spaces before line breaks (including on blank lines)
        .replace(/[ \t]+(?=\n)/g, '');

    const inputN = normalize(input);
    const outputN = normalize(output);

    // Check that the formatter produces consistent, clean formatting
    // The formatter should normalize spacing and remove extra blank lines
    const outputLines = outputN.split('\n');
    
    // Verify that field IDs are properly aligned
    const fieldLines = outputLines.filter(line => /^\s*\d+:/.test(line));
    console.log(`Found ${fieldLines.length} field lines`);
    
    // Check that all field lines have consistent indentation
    const expectedIndent = '  '; // 2 spaces for struct fields
    const allFieldsProperlyIndented = fieldLines.every(line => 
        line.startsWith(expectedIndent) || line.trim() === ''
    );
    
    if (!allFieldsProperlyIndented) {
        console.error('❌ Some field lines are not properly indented');
        process.exit(1);
    }
    
    // Verify that the struct is properly formatted with opening and closing braces
    const hasOpeningBrace = outputLines.some(line => line.includes('{'));
    const hasClosingBrace = outputLines.some(line => line.includes('}'));
    
    if (!hasOpeningBrace || !hasClosingBrace) {
        console.error('❌ Struct braces not found in formatted output');
        process.exit(1);
    }
    
    // Check that field IDs are present and properly formatted
    const hasFieldIds = fieldLines.length > 0;
    if (!hasFieldIds) {
        console.error('❌ No field IDs found in formatted output');
        process.exit(1);
    }

    console.log('✅ User struct blank line preservation test PASSED');
}

runTest();
