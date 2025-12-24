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

async function debugFindDefinitionInDocument() {
    console.log('🔍 Debugging findDefinitionInDocument method...');

    const sharedFile = path.resolve(__dirname, 'test-files/shared.thrift');
    const sharedContent = fs.readFileSync(sharedFile, 'utf8');
    const sharedUri = Uri.file(sharedFile);

    console.log('Testing findDefinitionInDocument for SharedStruct in shared.thrift');
    console.log(`File: ${sharedFile}`);
    console.log(`Content length: ${sharedContent.length} characters`);

    // Create a minimal provider instance to test the method
    const provider = new ThriftDefinitionProvider();

    // We need to access the private method, so let's create a wrapper
    const testFindDefinition = async (uri, text, typeName) => {
        // This simulates the findDefinitionInDocument method logic
        const {ThriftParser} = require('./out/ast/parser');

        console.log(`\n--- Testing with typeName: "${typeName}" ---`);
        console.log(`Text preview: ${text.substring(0, 100)}...`);

        // Parse the AST
        const parser = new ThriftParser(text);
        const ast = parser.parse();

        console.log(`AST type: ${ast.type}`);
        console.log(`AST body length: ${ast.body ? ast.body.length : 'undefined'}`);

        // Look for the definition manually
        function traverseAST(node, callback, path = '') {
            console.log(`Traversing node at ${path}: type=${node.type}, name=${node.name}`);

            // If callback returns false, stop traversal
            if (!callback(node)) {
                return false;
            }

            // Handle specific node types with nested structures
            if (node.type === 'Document') {
                // Document node has a body array containing all top-level definitions
                const doc = node;
                if (doc.body) {
                    for (let i = 0; i < doc.body.length; i++) {
                        if (!traverseAST(doc.body[i], callback, `${path}/body[${i}]`)) {
                            return false;
                        }
                    }
                }
            } else if (node.type === 'Struct' ||
                node.type === 'Union' ||
                node.type === 'Exception') {
                const struct = node;
                if (struct.fields) {
                    for (let i = 0; i < struct.fields.length; i++) {
                        if (!traverseAST(struct.fields[i], callback, `${path}/fields[${i}]`)) {
                            return false;
                        }
                    }
                }
            } else if (node.type === 'Enum') {
                const enumNode = node;
                if (enumNode.members) {
                    for (let i = 0; i < enumNode.members.length; i++) {
                        if (!traverseAST(enumNode.members[i], callback, `${path}/members[${i}]`)) {
                            return false;
                        }
                    }
                }
            } else if (node.type === 'Service') {
                const service = node;
                if (service.functions) {
                    for (let i = 0; i < service.functions.length; i++) {
                        if (!traverseAST(service.functions[i], callback, `${path}/functions[${i}]`)) {
                            return false;
                        }
                    }
                }
            } else if (node.type === 'Function') {
                const func = node;
                if (func.arguments) {
                    for (let i = 0; i < func.arguments.length; i++) {
                        if (!traverseAST(func.arguments[i], callback, `${path}/arguments[${i}]`)) {
                            return false;
                        }
                    }
                }
                if (func.throws) {
                    for (let i = 0; i < func.throws.length; i++) {
                        if (!traverseAST(func.throws[i], callback, `${path}/throws[${i}]`)) {
                            return false;
                        }
                    }
                }
            }

            return true;
        }

        let foundLocation = undefined;

        // Traverse AST to find the definition
        traverseAST(ast, (node) => {
            console.log(`Checking node: type=${node.type}, name=${node.name}`);
            if (node.name === typeName) {
                // Found the definition
                console.log(`FOUND! Creating location...`);
                foundLocation = new Location(uri, node.range.start);
                return false; // Stop traversal
            }
            return true; // Continue traversal
        });

        return foundLocation;
    };

    const result = await testFindDefinition(sharedUri, sharedContent, 'SharedStruct');

    if (result) {
        console.log(`✅ Definition found:`);
        console.log(`   File: ${result.uri.fsPath}`);
        console.log(`   Line: ${result.range.start.line}`);
        console.log(`   Character: ${result.range.start.character}`);
    } else {
        console.log('❌ No definition found');
    }
}

debugFindDefinitionInDocument().catch(console.error);