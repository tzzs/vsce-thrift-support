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

const {ThriftParser} = require('./out/ast/parser');

function safeStringify(obj, maxDepth = 3) {
    const seen = new WeakSet();

    function stringify(obj, depth) {
        if (depth > maxDepth) return '[Max depth reached]';
        if (obj === null) return 'null';
        if (obj === undefined) return 'undefined';
        if (typeof obj === 'string' || typeof obj === 'number' || typeof obj === 'boolean') return obj;

        if (typeof obj === 'object') {
            if (seen.has(obj)) return '[Circular]';
            seen.add(obj);

            if (Array.isArray(obj)) {
                return obj.map(item => stringify(item, depth + 1));
            }

            const result = {};
            for (const key in obj) {
                if (key === 'parent') continue; // Skip parent references
                result[key] = stringify(obj[key], depth + 1);
            }
            return result;
        }

        return String(obj);
    }

    return stringify(obj, 0);
}

async function debugAST() {
    console.log('🔍 Debugging AST parsing...');

    const sharedContent = fs.readFileSync(path.resolve(__dirname, 'test-files/shared.thrift'), 'utf8');
    console.log('Shared.thrift content:');
    console.log(sharedContent);
    console.log('\n--- Parsing AST ---');

    const parser = new ThriftParser(sharedContent);
    const ast = parser.parse();

    console.log('AST structure (safe):');
    console.log(JSON.stringify(safeStringify(ast), null, 2));

    // Look for SharedStruct specifically
    function findNode(node, name, path = '') {
        if (node.name === name) {
            console.log(`Found ${name} at path: ${path}`);
            return node;
        }

        if (node.body && Array.isArray(node.body)) {
            for (let i = 0; i < node.body.length; i++) {
                const found = findNode(node.body[i], name, `${path}/body[${i}]`);
                if (found) return found;
            }
        }

        return null;
    }

    const sharedStruct = findNode(ast, 'SharedStruct');
    if (sharedStruct) {
        console.log('SharedStruct found in AST:', sharedStruct);
    } else {
        console.log('SharedStruct NOT found in AST');
    }
}

debugAST().catch(console.error);