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
        // 简化版解析器，模拟真实解析结果
        const root = {
            type: ThriftNodeType.Document,
            range: new mockVscode.Range(0, 0, this.lines.length > 0 ? this.lines.length - 1 : 0,
                this.lines.length > 0 ? this.lines[this.lines.length - 1].length : 0),
            body: []
        };

        // 解析main.thrift的内容
        if (this.text.includes('struct User')) {
            root.body.push({
                type: ThriftNodeType.Struct,
                name: 'User',
                range: new mockVscode.Range(4, 0, 9, 1),
                fields: [
                    {
                        type: ThriftNodeType.Field,
                        id: 1,
                        requiredness: 'required',
                        fieldType: 'i32',
                        name: 'id',
                        range: new mockVscode.Range(5, 2, 5, 18)
                    },
                    {
                        type: ThriftNodeType.Field,
                        id: 2,
                        requiredness: 'optional',
                        fieldType: 'string',
                        name: 'name',
                        range: new mockVscode.Range(6, 2, 6, 23)
                    },
                    {
                        type: ThriftNodeType.Field,
                        id: 3,
                        requiredness: 'optional',
                        fieldType: 'shared.Address',
                        name: 'address',
                        range: new mockVscode.Range(7, 2, 7, 35)
                    },
                    {
                        type: ThriftNodeType.Field,
                        id: 4,
                        requiredness: 'required',
                        fieldType: 'shared.Priority',
                        name: 'priority',
                        range: new mockVscode.Range(8, 2, 8, 62),
                        defaultValue: 'shared.Priority.LOW'
                    }
                ]
            });

            root.body.push({
                type: ThriftNodeType.Service,
                name: 'UserManagementService',
                range: new mockVscode.Range(11, 0, 15, 1),
                functions: [
                    {
                        type: ThriftNodeType.Function,
                        name: 'createUser',
                        returnType: 'User',
                        oneway: false,
                        range: new mockVscode.Range(12, 2, 12, 32),
                        arguments: [
                            {
                                type: ThriftNodeType.Field,
                                id: 1,
                                requiredness: undefined,
                                fieldType: 'User',
                                name: 'user',
                                range: new mockVscode.Range(12, 22, 12, 31)
                            }
                        ],
                        throws: []
                    },
                    {
                        type: ThriftNodeType.Function,
                        name: 'updateUser',
                        returnType: 'void',
                        oneway: false,
                        range: new mockVscode.Range(13, 2, 13, 47),
                        arguments: [
                            {
                                type: ThriftNodeType.Field,
                                id: 1,
                                requiredness: undefined,
                                fieldType: 'i32',
                                name: 'userId',
                                range: new mockVscode.Range(13, 19, 13, 30)
                            },
                            {
                                type: ThriftNodeType.Field,
                                id: 2,
                                requiredness: undefined,
                                fieldType: 'User',
                                name: 'user',
                                range: new mockVscode.Range(13, 32, 13, 41)
                            }
                        ],
                        throws: []
                    },
                    {
                        type: ThriftNodeType.Function,
                        name: 'getAddress',
                        returnType: 'shared.Address',
                        oneway: false,
                        range: new mockVscode.Range(14, 2, 14, 45),
                        arguments: [
                            {
                                type: ThriftNodeType.Field,
                                id: 1,
                                requiredness: undefined,
                                fieldType: 'i32',
                                name: 'userId',
                                range: new mockVscode.Range(14, 25, 14, 36)
                            }
                        ],
                        throws: []
                    }
                ]
            });
        } else if (this.text.includes('enum Priority')) {
            // 解析shared.thrift的内容
            root.body.push({
                type: ThriftNodeType.Enum,
                name: 'Priority',
                range: new mockVscode.Range(2, 0, 6, 1),
                members: [
                    {
                        type: ThriftNodeType.EnumMember,
                        name: 'LOW',
                        initializer: '1',
                        range: new mockVscode.Range(3, 2, 3, 11)
                    },
                    {
                        type: ThriftNodeType.EnumMember,
                        name: 'MEDIUM',
                        initializer: '2',
                        range: new mockVscode.Range(4, 2, 4, 14)
                    },
                    {
                        type: ThriftNodeType.EnumMember,
                        name: 'HIGH',
                        initializer: '3',
                        range: new mockVscode.Range(5, 2, 5, 12)
                    }
                ]
            });

            root.body.push({
                type: ThriftNodeType.Struct,
                name: 'Address',
                range: new mockVscode.Range(8, 0, 12, 1),
                fields: [
                    {
                        type: ThriftNodeType.Field,
                        id: 1,
                        requiredness: 'required',
                        fieldType: 'string',
                        name: 'street',
                        range: new mockVscode.Range(9, 2, 9, 23)
                    },
                    {
                        type: ThriftNodeType.Field,
                        id: 2,
                        requiredness: 'optional',
                        fieldType: 'string',
                        name: 'city',
                        range: new mockVscode.Range(10, 2, 10, 21)
                    },
                    {
                        type: ThriftNodeType.Field,
                        id: 3,
                        requiredness: 'optional',
                        fieldType: 'string',
                        name: 'country',
                        range: new mockVscode.Range(11, 2, 11, 24)
                    }
                ]
            });
        }

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

        if (node.children && Array.isArray(node.children)) {
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

            // For function return types and argument types
            if (node.type === ThriftNodeType.Function) {
                if (node.returnType === symbolName) {
                    console.log('Found function return type reference to symbol:', symbolName);
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

    // 读取实际的测试文件
    const mainContent = fs.readFileSync(path.join(__dirname, 'tests', 'test-files', 'main.thrift'), 'utf8');
    const sharedContent = fs.readFileSync(path.join(__dirname, 'tests', 'test-files', 'shared.thrift'), 'utf8');

    console.log('=== Testing main.thrift ===');
    console.log('Content:');
    console.log(mainContent);

    try {
        console.log('\nCalling findReferencesInDocument for "User" in main.thrift...\n');
        const userRefs = await provider.findReferencesInDocument('main.thrift', mainContent, 'User');
        console.log('\nUser references in main.thrift:', userRefs);

        console.log('\nCalling findReferencesInDocument for "Address" in main.thrift...\n');
        const addressRefs = await provider.findReferencesInDocument('main.thrift', mainContent, 'Address');
        console.log('\nAddress references in main.thrift:', addressRefs);

    } catch (error) {
        console.error('\nError in findReferencesInDocument:', error);
        console.error('Error stack:', error.stack);
    }

    console.log('\n=== Testing shared.thrift ===');
    console.log('Content:');
    console.log(sharedContent);

    try {
        console.log('\nCalling findReferencesInDocument for "Priority" in shared.thrift...\n');
        const priorityRefs = await provider.findReferencesInDocument('shared.thrift', sharedContent, 'Priority');
        console.log('\nPriority references in shared.thrift:', priorityRefs);

        console.log('\nCalling findReferencesInDocument for "Address" in shared.thrift...\n');
        const addressRefs = await provider.findReferencesInDocument('shared.thrift', sharedContent, 'Address');
        console.log('\nAddress references in shared.thrift:', addressRefs);

    } catch (error) {
        console.error('\nError in findReferencesInDocument:', error);
        console.error('Error stack:', error.stack);
    }
}

// 运行调试
debugReferencesFix().catch(console.error);