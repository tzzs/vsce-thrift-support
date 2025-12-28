// Tests for namespaced navigation and quoted include selection behavior

const path = require('path');
const fs = require('fs');

// Minimal VSCode mock matching patterns used by provider
const {createVscodeMock, installVscodeMock} = require('../../mock_vscode.js');
const vscode = createVscodeMock({
    Position: class {
        constructor(line, character) {
            this.line = line;
            this.character = character;
        }
    },
    Range: class {
        constructor(startLine, startChar, endLine, endChar) {
            this.start = new vscode.Position(startLine, startChar);
            this.end = new vscode.Position(endLine, endChar);
        }
    },
    Location: class {
        constructor(uri, position) {
            this.uri = uri;
            this.range = {start: position, end: position};
        }
    },
    Uri: {file: (p) => ({fsPath: p, toString: () => `file://${p}`})},
    workspace: {
        textDocuments: [], // Add missing textDocuments property
        fs: {
            stat: async (uri) => {
                return new Promise((resolve, reject) => {
                    fs.stat(uri.fsPath, (err, stats) => err ? reject(err) : resolve(stats));
                });
            },
            readFile: async (uri) => {
                return new Promise((resolve, reject) => {
                    fs.readFile(uri.fsPath, (err, data) => err ? reject(err) : resolve(data));
                });
            }
        },
        openTextDocument: async (uri) => {
            const content = fs.readFileSync(uri.fsPath, 'utf8');
            const lines = content.split('\n');
            return {
                uri,
                getText: () => content,
                lineAt: (line) => ({text: lines[line] || '',
                    range: {
                        start: new vscode.Position(line, 0),
                        end: new vscode.Position(line, (lines[line] || '').length)
                    }
                }),
                getWordRangeAtPosition: (position) => {
                    const lineText = lines[position.line] || '';
                    let s = position.character, e = position.character;
                    while (s > 0 && /\w/.test(lineText[s - 1])) s--;
                    while (e < lineText.length && /\w/.test(lineText[e])) e++;
                    if (s === e) return undefined;
                    return {start: new vscode.Position(position.line, s), end: new vscode.Position(position.line, e)};
                }
            };
        },
        findFiles: async () => []
    }
});
installVscodeMock(vscode);


// Hook mock into require('vscode')
const {ThriftDefinitionProvider} = require('../../../out/definitionProvider.js');

async function run() {
    const provider = new ThriftDefinitionProvider();

    const mainPath = path.join(__dirname, '..', '..', 'test-files', 'main.thrift');
    const mainUri = vscode.Uri.file(mainPath);
    const mainDoc = await vscode.workspace.openTextDocument(mainUri);
    const mainContent = mainDoc.getText();
    const mainLines = mainContent.split('\n');

    // Locate include line and quoted path
    let includeLine = -1;
    let quoteStart = -1;
    let quoteEnd = -1;
    for (let i = 0; i < mainLines.length; i++) {
        const m = mainLines[i].match(/^\s*include\s+(["'])([^"']+)\1/);
        if (m) {
            includeLine = i;
            quoteStart = mainLines[i].indexOf(m[1]);
            quoteEnd = mainLines[i].lastIndexOf(m[1]);
            break;
        }
    }
    if (includeLine < 0) throw new Error('include line not found in main.thrift');

    // 1) Clicking inside quoted path should navigate to shared.thrift
    const posInsidePath = new vscode.Position(includeLine, quoteStart + 2); // within ../test-files...
    let def = await provider.provideDefinition(mainDoc, posInsidePath, {});
    if (!def || !def.uri || !/shared\.thrift$/.test(def.uri.fsPath)) {
        console.error('❌ Expected navigation to shared.thrift when clicking inside quoted path');
        process.exit(1);
    } else {
        console.log('✅ Include quoted path navigation works');
    }

    // 2) Clicking on include keyword should NOT navigate
    const includeIdx = mainLines[includeLine].indexOf('include');
    const posOnInclude = new vscode.Position(includeLine, includeIdx + 2);
    def = await provider.provideDefinition(mainDoc, posOnInclude, {});
    if (def) {
        console.error('❌ Should not navigate when clicking on include keyword');
        process.exit(1);
    } else {
        console.log('✅ No navigation when clicking include keyword');
    }

    // Locate usage line with shared.Address
    let usageLine = -1;
    let usageText = '';
    for (let i = 0; i < mainLines.length; i++) {
        if (/shared\.Address/.test(mainLines[i])) {
            usageLine = i;
            usageText = mainLines[i];
            break;
        }
    }
    if (usageLine < 0) throw new Error('usage line with shared.Address not found');

    const nsIdx = usageText.indexOf('shared');
    const typeIdx = usageText.indexOf('Address');

    // 3) Clicking on namespace 'shared' should jump to include line in same file
    const posOnNs = new vscode.Position(usageLine, nsIdx + 2);
    def = await provider.provideDefinition(mainDoc, posOnNs, {});
    if (!def || def.uri.fsPath !== mainUri.fsPath || def.range.start.line !== includeLine) {
        console.error('❌ Clicking namespace did not navigate to include line');
        process.exit(1);
    } else {
        console.log('✅ Namespace click navigates to include line');
    }

    // 4) Clicking on type 'Address' should navigate to its definition in shared.thrift
    const posOnType = new vscode.Position(usageLine, typeIdx + 2);
    def = await provider.provideDefinition(mainDoc, posOnType, {});
    if (!def || !/shared\.thrift$/.test(def.uri.fsPath)) {
        console.error('❌ Clicking type did not navigate to shared.thrift definition');
        process.exit(1);
    } else {
        console.log('✅ Type click navigates to Address definition');
    }

    console.log('\nAll namespace/include navigation tests passed.');
}

run().catch(err => {
    console.error('Test crashed:', err);
    process.exit(1);
});
