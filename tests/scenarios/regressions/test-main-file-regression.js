// Regression test for test-files/main.thrift ensuring commas are tight to the last token (no spaces before comma)
const fs = require('fs');
const path = require('path');

// Mock VSCode API
const {createVscodeMock, installVscodeMock} = require('../../mock_vscode.js');
const vscode = createVscodeMock({
    workspace: {
        getConfiguration: (section) => {
            const config = {
                'thrift-support.formatting.trailingComma': global._trailingCommaMode || 'preserve',
                'thrift-support.formatting.alignTypes': true,
                'thrift-support.formatting.alignFieldNames': true,
                'thrift-support.formatting.alignComments': true,
                'thrift-support.formatting.alignEnumNames': true,
                'thrift-support.formatting.alignEnumEquals': true,
                'thrift-support.formatting.alignEnumValues': true,
                'thrift-support.formatting.indentSize': 4
            };
            return {
                get: (key) => {
                    const fullKey = section ? `${section}.${key}` : key;
                    return config[fullKey] !== undefined ? config[fullKey] : null;
                }
            };
        }
    },
    TextEdit: {
        replace: (range, newText) => ({range, newText})
    }
});
installVscodeMock(vscode);


// Set up module mock before requiring formatter
// Import the formatter
const {ThriftFormattingProvider} = require('../../../out/src/formattingProvider.js');

// Restore original require
Module.prototype.require = originalRequire;

function run() {
    const formatter = new ThriftFormattingProvider();
    const mainPath = path.resolve(__dirname, '..', '..', '..', 'test-files', 'main.thrift');
    const input = fs.readFileSync(mainPath, 'utf8');

    const modes = ['preserve', 'add', 'remove'];
    let failures = 0;

    for (const mode of modes) {
        console.log(`\n--- Running main.thrift regression with trailingComma = ${mode} ---`);
        global._trailingCommaMode = mode;

        const mockDocument = {
            getText: () => input
        };
        const mockRange = {start: {line: 0, character: 0}, end: {line: 9999, character: 0}};
        const mockOptions = {insertSpaces: true, tabSize: 4};

        try {
            const edits = formatter.provideDocumentRangeFormattingEdits(
                mockDocument,
                mockRange,
                mockOptions
            );
            const output = edits && edits[0] ? edits[0].newText : input;

            // Extract target lines
            const outLines = output.split('\n');
            const sharedLine = outLines.find(l => /sharedData/.test(l)) || '';
            const statusLine = outLines.find(l => /status\b/.test(l)) || '';

            // Checks
            const noSpaceBeforeCommaGlobal = /\)\s+,/m.test(output) === false;
            // Accept either a comma immediately after ')' (optionally followed by a comment) OR a comma at end-of-line (after an inline comment)
            const sharedCommaAfterParen = /\),\s*(?:\/\/.*)?$/.test(sharedLine);
            const sharedEndsWithComma = /,\s*$/.test(sharedLine);
            const hasCommaShared = sharedCommaAfterParen || sharedEndsWithComma;
            const statusCommaAfterParen = /\),\s*(?:\/\/.*)?$/.test(statusLine);
            const statusEndsWithComma = /,\s*$/.test(statusLine);
            const hasCommaStatus = statusCommaAfterParen || statusEndsWithComma;
            const noTrailingSpacesShared = !/[ \t]+$/.test(sharedLine);
            const noTrailingSpacesStatus = !/[ \t]+$/.test(statusLine);

            let pass;
            if (mode === 'remove') {
                // In remove mode, there should be no commas, and no trailing spaces left behind
                pass = !hasCommaShared && !hasCommaStatus && noTrailingSpacesShared && noTrailingSpacesStatus;
                console.log('No comma on sharedData line:', !hasCommaShared ? 'PASS' : 'FAIL');
                console.log('No comma on status line:', !hasCommaStatus ? 'PASS' : 'FAIL');
                console.log('No trailing spaces (sharedData):', noTrailingSpacesShared ? 'PASS' : 'FAIL');
                console.log('No trailing spaces (status):', noTrailingSpacesStatus ? 'PASS' : 'FAIL');
            } else {
                // In preserve/add modes, commas should be present and comma must be tight (no space before comma)
                pass = noSpaceBeforeCommaGlobal && hasCommaShared && hasCommaStatus;
                console.log('No space before comma check (global):', noSpaceBeforeCommaGlobal ? 'PASS' : 'FAIL');
                console.log('sharedData line ends with comma:', hasCommaShared ? 'PASS' : 'FAIL');
                console.log('status line ends with comma:', hasCommaStatus ? 'PASS' : 'FAIL');
            }

            if (!pass) {
                console.log('\nFormatted Output:\n' + output);
                failures++;
            }
        } catch (e) {
            console.error('Error running regression test:', e);
            failures++;
        }
    }

    delete global._trailingCommaMode;

    if (failures > 0) {
        console.error(`\n${failures} regression check(s) failed.`);
        process.exit(1);
    }

    console.log('\nMain.thrift regression checks passed.');
}

run();
