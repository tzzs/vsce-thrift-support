const path = require('path');
const fs = require('fs');

// Mock VS Code API
class Position {
    constructor(line, character) {
        this.line = line;
        this.character = character;
    }
}

class Range {
    constructor(a, b, c, d) {
        if (a instanceof Position && b instanceof Position) {
            this.start = a;
            this.end = b;
        } else if (typeof a === 'number' && typeof b === 'number' && typeof c === 'number' && typeof d === 'number') {
            this.start = new Position(a, b);
            this.end = new Position(c, d);
        } else {
            this.start = a && typeof a.line === 'number' && typeof a.character === 'number' ? new Position(a.line, a.character) : new Position(0, 0);
            this.end = b && typeof b.line === 'number' && typeof b.character === 'number' ? new Position(b.line, b.character) : new Position(0, 0);
        }
    }
}

class Location {
    constructor(uri, position) {
        this.uri = uri;
        this.range = {start: position, end: position};
    }
}

class Uri {
    static file(fsPath) {
        return {fsPath, toString: () => `file://${fsPath}`};
    }
}

const workspace = {
    async openTextDocument(file) {
        const fsPath = typeof file === 'string' ? file : file.fsPath;
        const text = fs.readFileSync(fsPath, 'utf8');
        const lines = text.split('\n');
        return {
            uri: {fsPath},
            getText: () => text,
            lineAt: (line) => ({text: lines[line] || ''}),
            getWordRangeAtPosition: (position) => {
                const lineText = lines[position.line] || '';
                let s = position.character, e = position.character;
                while (s > 0 && /\w/.test(lineText[s - 1])) s--;
                while (e < lineText.length && /\w/.test(lineText[e])) e++;
                if (s === e) return undefined;
                return new Range(position.line, s, position.line, e);
            }
        };
    },
    async findFiles(glob) {
        const dir = path.resolve(__dirname, 'test-files');
        const files = fs.readdirSync(dir).filter(f => f.endsWith('.thrift'));
        return files.map(f => ({fsPath: path.join(dir, f)}));
    },
    fs: {
        async stat(uri) {
            fs.statSync(uri.fsPath);
        }
    },
    textDocuments: []
};

// Patch requires
const Module = require('module');
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
    if (request === 'vscode') {
        return {Position, Range, Location, Uri, workspace};
    }
    return originalLoad.apply(this, arguments);
};

const {ThriftDefinitionProvider} = require('./out/definitionProvider');

async function debugDefinition() {
    console.log('🔍 Debugging definition provider...');

    const doc = await workspace.openTextDocument(path.resolve(__dirname, 'test-files/main-edge.thrift'));
    const provider = new ThriftDefinitionProvider();

    // Test the failing case: line 6, SharedStruct
    const line = 6;
    const lineText = doc.lineAt(line).text;
    console.log(`Line ${line}: "${lineText}"`);

    const typeIdx = lineText.indexOf('SharedStruct');
    console.log(`SharedStruct found at index: ${typeIdx}`);

    const pos = new Position(line, typeIdx + 1);
    console.log(`Position: line ${pos.line}, character ${pos.character}`);

    console.log('\n--- Testing provideDefinition ---');
    const loc = await provider.provideDefinition(doc, pos, {});

    if (loc) {
        console.log(`✅ Definition found:`);
        console.log(`   File: ${loc.uri.fsPath}`);
        console.log(`   Line: ${loc.range.start.line}`);
        console.log(`   Character: ${loc.range.start.character}`);
    } else {
        console.log('❌ No definition found');

        // Let's debug the included files
        console.log('\n--- Debugging included files ---');
        const text = doc.getText();
        const lines = text.split('\n');

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            const includeMatch = line.match(/^include\s+["']([^"']+)["']/);
            if (includeMatch) {
                const includePath = includeMatch[1];
                const fullPath = path.resolve(path.dirname(doc.uri.fsPath), includePath);
                console.log(`Include line ${i}: "${line}"`);
                console.log(`  Resolved path: ${fullPath}`);
                console.log(`  File exists: ${fs.existsSync(fullPath)}`);

                if (fs.existsSync(fullPath)) {
                    const includeContent = fs.readFileSync(fullPath, 'utf8');
                    console.log(`  Content preview: ${includeContent.substring(0, 100)}...`);

                    // Check if SharedStruct is defined in this file
                    const hasSharedStruct = includeContent.includes('struct SharedStruct');
                    console.log(`  Contains SharedStruct: ${hasSharedStruct}`);
                }
            }
        }
    }
}

debugDefinition().catch(console.error);