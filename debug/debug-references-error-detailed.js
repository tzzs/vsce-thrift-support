const fs = require('fs');
const path = require('path');

// 模拟VS Code API的部分功能
class Position {
    constructor(line, character) {
        this.line = line;
        this.character = character;
    }
}

class Range {
    constructor(startLine, startChar, endLine, endChar) {
        this.start = new Position(startLine, startChar);
        this.end = new Position(endLine, endChar);
    }

    contains(position) {
        // 简化的包含检查
        return true;
    }
}

class Uri {
    constructor(scheme, authority, path, query, fragment) {
        this.scheme = scheme;
        this.authority = authority;
        this.path = path;
        this.query = query;
        this.fragment = fragment;
        this.fsPath = path;
    }

    static file(filePath) {
        return new Uri('file', '', filePath, '', '');
    }
}

// 模拟AST节点类型
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
    constructor(text) {
        this.text = text;
    }

    parse() {
        // 返回一个模拟的AST
        return {
            type: ThriftNodeType.Document,
            range: new Range(0, 0, 10, 0),
            body: [
                {
                    type: ThriftNodeType.Struct,
                    name: 'User',
                    range: new Range(0, 0, 3, 1),
                    fields: [
                        {
                            type: ThriftNodeType.Field,
                            id: 1,
                            name: 'id',
                            fieldType: 'i32',
                            range: new Range(1, 2, 1, 15)
                        },
                        {
                            type: ThriftNodeType.Field,
                            id: 2,
                            name: 'name',
                            fieldType: 'string',
                            range: new Range(2, 2, 2, 21)
                        }
                    ]
                }
            ]
        };
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
        });

        return references;
    }
}

async function debugReferencesErrorDetailed() {
    console.log('=== Debugging References Error Detailed ===\n');

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

    } catch (error) {
        console.error('\nError in findReferencesInDocument for User:', error);
        console.error('Error stack:', error.stack);
    }

    console.log('\n=== Testing shared.thrift ===');
    console.log('Content:');
    console.log(sharedContent);

    try {
        console.log('\nCalling findReferencesInDocument for "Priority" in shared.thrift...\n');
        const priorityRefs = await provider.findReferencesInDocument('shared.thrift', sharedContent, 'Priority');
        console.log('\nPriority references in shared.thrift:', priorityRefs);

    } catch (error) {
        console.error('\nError in findReferencesInDocument for Priority:', error);
        console.error('Error stack:', error.stack);
    }
}

// 运行调试
debugReferencesErrorDetailed().catch(console.error);