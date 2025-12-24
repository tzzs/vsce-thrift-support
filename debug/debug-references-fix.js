const fs = require('fs');
const path = require('path');

// 模拟VS Code API的部分功能
const mockVscode = {
    Position: class Position {
        constructor(line, character) {
            this.line = line;
            this.character = character;
        }
    },

    Range: class Range {
        constructor(startLine, startCharacter, endLine, endCharacter) {
            this.start = new mockVscode.Position(startLine, startCharacter);
            this.end = new mockVscode.Position(endLine, endCharacter);
        }

        contains(position) {
            return position.line >= this.start.line && position.line <= this.end.line;
        }
    },

    Location: class Location {
        constructor(uri, range) {
            this.uri = uri;
            this.range = range;
        }
    },

    Uri: {
        file: (fsPath) => ({fsPath}),
        parse: (uri) => ({fsPath: uri})
    }
};

// 模拟节点类型
const ThriftNodeType = {
    Document: 'Document',
    Namespace: 'Namespace',
    Include: 'Include',
    Const: 'Const',
    Typedef: 'Typedef',
    Enum: 'Enum',
    EnumMember: 'EnumMember',
    Struct: 'Struct',
    Union: 'Union',
    Exception: 'Exception',
    Service: 'Service',
    Function: 'Function',
    Field: 'Field',
    Comment: 'Comment'
};

// 模拟ThriftParser
class ThriftParser {
    constructor(documentOrContent) {
        if (typeof documentOrContent === 'string') {
            this.text = documentOrContent;
        } else {
            this.text = documentOrContent.getText();
        }
        this.lines = this.text.split(/\r?\n/);
    }

    parse() {
        const root = {
            type: ThriftNodeType.Document,
            range: new mockVscode.Range(0, 0, this.lines.length > 0 ? this.lines.length - 1 : 0,
                this.lines.length > 0 ? this.lines[this.lines.length - 1].length : 0),
            body: []
        };

        // 简化的解析逻辑，仅用于测试
        root.body = [
            {
                type: ThriftNodeType.Struct,
                name: 'User',
                range: new mockVscode.Range(0, 0, 5, 1),
                fields: [
                    {
                        type: ThriftNodeType.Field,
                        id: 1,
                        requiredness: 'required',
                        fieldType: 'i32',
                        name: 'id',
                        range: new mockVscode.Range(1, 2, 1, 20)
                    },
                    {
                        type: ThriftNodeType.Field,
                        id: 2,
                        requiredness: 'optional',
                        fieldType: 'string',
                        name: 'name',
                        range: new mockVscode.Range(2, 2, 2, 25)
                    }
                ]
            }
        ];

        return root;
    }
}

// 模拟引用提供程序的部分功能
class ThriftReferencesProvider {
    constructor() {
        console.log('Initializing ThriftReferencesProvider...');
    }

    traverseAST(node, callback) {
        console.log('Traversing node:', node.type, node.name || '');

        try {
            callback(node);
        } catch (error) {
            console.error('Error in callback for node:', node, error);
            throw error;
        }

        if (node.children) {
            console.log('Processing children...');
            node.children.forEach(child => this.traverseAST(child, callback));
        }

        // Handle specific node types with nested structures
        if (node.type === ThriftNodeType.Struct ||
            node.type === ThriftNodeType.Union ||
            node.type === ThriftNodeType.Exception) {
            console.log('Processing struct fields...');
            const struct = node;
            if (struct.fields && Array.isArray(struct.fields)) {
                struct.fields.forEach(field => {
                    console.log('Processing field:', field.name);
                    this.traverseAST(field, callback);
                });
            } else {
                console.log('No fields found in struct or fields is not an array');
            }
        } else if (node.type === ThriftNodeType.Enum) {
            console.log('Processing enum members...');
            const enumNode = node;
            if (enumNode.members && Array.isArray(enumNode.members)) {
                enumNode.members.forEach(member => {
                    console.log('Processing member:', member.name);
                    this.traverseAST(member, callback);
                });
            } else {
                console.log('No members found in enum or members is not an array');
            }
        } else if (node.type === ThriftNodeType.Service) {
            console.log('Processing service functions...');
            const service = node;
            if (service.functions && Array.isArray(service.functions)) {
                service.functions.forEach(func => {
                    console.log('Processing function:', func.name);
                    this.traverseAST(func, callback);
                });
            } else {
                console.log('No functions found in service or functions is not an array');
            }
        } else if (node.type === ThriftNodeType.Function) {
            console.log('Processing function args and throws...');
            const func = node;
            if (func.arguments && Array.isArray(func.arguments)) {
                func.arguments.forEach(arg => {
                    console.log('Processing argument:', arg.name);
                    this.traverseAST(arg, callback);
                });
            } else {
                console.log('No arguments found in function or arguments is not an array');
            }
            if (func.throws && Array.isArray(func.throws)) {
                func.throws.forEach(throwNode => {
                    console.log('Processing throw:', throwNode.name);
                    this.traverseAST(throwNode, callback);
                });
            } else {
                console.log('No throws found in function or throws is not an array');
            }
        }
    }

    async findReferencesInDocument(uri, text, symbolName) {
        console.log('Finding references in document for symbol:', symbolName);
        const references = [];
        const parser = new ThriftParser(text);
        const ast = parser.parse();

        console.log('Parsed AST:', JSON.stringify(ast, null, 2));

        // Traverse the AST to find references
        this.traverseAST(ast, (node) => {
            console.log('Checking node:', node.type, node.name || '');
            if (node.name === symbolName) {
                console.log('Found reference to symbol:', symbolName);
                // Create a location for this reference
                references.push({
                    uri: uri,
                    range: node.range
                });
            }

            // For field types, we need special handling
            if (node.type === ThriftNodeType.Field) {
                if (node.fieldType === symbolName) {
                    console.log('Found field type reference to symbol:', symbolName);
                    // We'd need to track the position of the fieldType in the original text
                    references.push({
                        uri: uri,
                        range: node.range
                    });
                }
            }
        });

        return references;
    }
}

async function debugReferencesFix() {
    console.log('=== Debugging References Fix ===\n');

    const provider = new ThriftReferencesProvider();

    // 测试文本
    const text = `struct User {
    1: required i32 id,
    2: optional string name
}`;

    console.log('Document text:');
    console.log(text);

    try {
        console.log('\nCalling findReferencesInDocument...\n');
        const references = await provider.findReferencesInDocument('test.thrift', text, 'User');
        console.log('\nReferences result:', references);
    } catch (error) {
        console.error('\nError in findReferencesInDocument:', error);
        console.error('Error stack:', error.stack);
    }
}

// 运行调试
debugReferencesFix().catch(console.error);