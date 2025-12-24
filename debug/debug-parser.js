const fs = require('fs');
const path = require('path');

// 模拟vscode对象
const vscode = {
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

        contains(position) {
            // 简化的包含检查
            return true;
        }
    }
};

// 模拟模块导入
const nodes = {
    ThriftNodeType: {
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
    }
};

// 简化的ThriftParser实现（基于实际代码）
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
            type: nodes.ThriftNodeType.Document,
            range: new vscode.Range(0, 0, this.lines.length > 0 ? this.lines.length - 1 : 0,
                this.lines.length > 0 ? this.lines[this.lines.length - 1].length : 0),
            body: []
        };

        this.currentLine = 0;
        while (this.currentLine < this.lines.length) {
            const node = this.parseNextNode(root);
            if (node) {
                root.body.push(node);
            } else {
                this.currentLine++;
            }
        }

        return root;
    }

    parseNextNode(parent) {
        if (this.currentLine >= this.lines.length) {
            return null;
        }

        const line = this.lines[this.currentLine];
        const trimmed = line.trim();

        // Skip empty lines and comments
        if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('#')) {
            return null;
        }

        // Namespace
        const namespaceMatch = trimmed.match(/^namespace\s+([a-zA-Z0-9_.]+)\s+([a-zA-Z0-9_.]+)/);
        if (namespaceMatch) {
            const node = {
                type: nodes.ThriftNodeType.Namespace,
                range: new vscode.Range(this.currentLine, 0, this.currentLine, line.length),
                parent: parent,
                scope: namespaceMatch[1],
                namespace: namespaceMatch[2],
                name: namespaceMatch[2]
            };
            return node;
        }

        // Include
        const includeMatch = trimmed.match(/^include\s+['"](.+)['"]/);
        if (includeMatch) {
            const node = {
                type: nodes.ThriftNodeType.Include,
                range: new vscode.Range(this.currentLine, 0, this.currentLine, line.length),
                parent: parent,
                path: includeMatch[1],
                name: includeMatch[1]
            };
            return node;
        }

        // Struct, Union, Exception
        const structMatch = trimmed.match(/^(struct|union|exception)\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
        if (structMatch) {
            return this.parseStruct(parent, structMatch[1], structMatch[2]);
        }

        // Enum
        const enumMatch = trimmed.match(/^enum\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
        if (enumMatch) {
            return this.parseEnum(parent, enumMatch[1]);
        }

        // Service
        const serviceMatch = trimmed.match(/^service\s+([a-zA-Z_][a-zA-Z0-9_]*)(?:\s+extends\s+([a-zA-Z_][a-zA-Z0-9_.]*))?/);
        if (serviceMatch) {
            return this.parseService(parent, serviceMatch[1], serviceMatch[2]);
        }

        // Const
        const constMatch = trimmed.match(/^const\s+([a-zA-Z0-9_<>]+)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*=/);
        if (constMatch) {
            const node = {
                type: nodes.ThriftNodeType.Const,
                range: new vscode.Range(this.currentLine, 0, this.currentLine, line.length),
                parent: parent,
                valueType: constMatch[1],
                name: constMatch[2],
                value: ''
            };
            return node;
        }

        // Typedef
        const typedefMatch = trimmed.match(/^typedef\s+(.+)\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
        if (typedefMatch) {
            const node = {
                type: nodes.ThriftNodeType.Typedef,
                range: new vscode.Range(this.currentLine, 0, this.currentLine, line.length),
                parent: parent,
                aliasType: typedefMatch[1],
                name: typedefMatch[2]
            };
            return node;
        }

        return null;
    }

    parseStruct(parent, structType, name) {
        const startLine = this.currentLine;
        const type = structType === 'exception' ? nodes.ThriftNodeType.Exception :
            structType === 'union' ? nodes.ThriftNodeType.Union : nodes.ThriftNodeType.Struct;

        const structNode = {
            type: type,
            name: name,
            range: new vscode.Range(startLine, 0, startLine, 0), // Will be updated
            parent: parent,
            fields: []
        };

        // Parse body
        this.currentLine = this.parseStructBody(structNode);
        structNode.range = new vscode.Range(startLine, 0, this.currentLine,
            this.lines[this.currentLine] ? this.lines[this.currentLine].length : 0);
        return structNode;
    }

    parseStructBody(parent) {
        let braceCount = 0;
        const startLine = this.currentLine;

        // Find opening brace
        while (this.currentLine < this.lines.length) {
            const line = this.lines[this.currentLine];
            if (line.includes('{')) {
                braceCount++;
                break;
            }
            this.currentLine++;
        }

        this.currentLine++; // Move past opening brace

        // Parse fields until closing brace
        while (this.currentLine < this.lines.length && braceCount > 0) {
            const line = this.lines[this.currentLine];
            const trimmed = line.trim();

            if (trimmed.includes('{')) {
                braceCount++;
            }
            if (trimmed.includes('}')) {
                braceCount--;
                if (braceCount <= 0) {
                    this.currentLine++;
                    break;
                }
            }

            // Field regex: 1: optional string name,
            const fieldMatch = trimmed.match(/^(\d+):\s*(?:(required|optional)\s+)?([a-zA-Z0-9_<>.,\s]+)\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
            if (fieldMatch) {
                const field = {
                    type: nodes.ThriftNodeType.Field,
                    range: new vscode.Range(this.currentLine, 0, this.currentLine, line.length),
                    parent: parent,
                    id: parseInt(fieldMatch[1]),
                    requiredness: fieldMatch[2],
                    fieldType: fieldMatch[3].trim(),
                    name: fieldMatch[4]
                };

                // Check for default value
                const defaultValueMatch = trimmed.match(/=\s*([^,;]+)/);
                if (defaultValueMatch) {
                    field.defaultValue = defaultValueMatch[1].trim();
                }

                parent.fields.push(field);
            }

            this.currentLine++;
        }

        return this.currentLine;
    }

    parseEnum(parent, name) {
        const startLine = this.currentLine;
        const enumNode = {
            type: nodes.ThriftNodeType.Enum,
            name: name,
            range: new vscode.Range(startLine, 0, startLine, 0), // Will be updated
            parent: parent,
            members: []
        };

        // Parse body
        this.currentLine = this.parseEnumBody(enumNode);
        enumNode.range = new vscode.Range(startLine, 0, this.currentLine,
            this.lines[this.currentLine] ? this.lines[this.currentLine].length : 0);
        return enumNode;
    }

    parseEnumBody(parent) {
        let braceCount = 0;
        const startLine = this.currentLine;

        // Find opening brace
        while (this.currentLine < this.lines.length) {
            const line = this.lines[this.currentLine];
            if (line.includes('{')) {
                braceCount++;
                break;
            }
            this.currentLine++;
        }

        this.currentLine++; // Move past opening brace

        // Parse members until closing brace
        while (this.currentLine < this.lines.length && braceCount > 0) {
            const line = this.lines[this.currentLine];
            const trimmed = line.trim();

            if (trimmed.includes('{')) {
                braceCount++;
            }
            if (trimmed.includes('}')) {
                braceCount--;
                if (braceCount <= 0) {
                    this.currentLine++;
                    break;
                }
            }

            // Enum Member: NAME = 1, or just NAME,
            const memberMatch = trimmed.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*(?:=\s*(\d+|0x[0-9a-fA-F]+))?/);
            if (memberMatch && trimmed && !trimmed.startsWith('//')) {
                const member = {
                    type: nodes.ThriftNodeType.EnumMember,
                    range: new vscode.Range(this.currentLine, 0, this.currentLine, line.length),
                    parent: parent,
                    name: memberMatch[1],
                    initializer: memberMatch[2]
                };
                parent.members.push(member);
            }

            this.currentLine++;
        }

        return this.currentLine;
    }

    parseService(parent, name, extendsClass) {
        const startLine = this.currentLine;
        const serviceNode = {
            type: nodes.ThriftNodeType.Service,
            name: name,
            extends: extendsClass,
            range: new vscode.Range(startLine, 0, startLine, 0), // Will be updated
            parent: parent,
            functions: []
        };

        // Parse body
        this.currentLine = this.parseServiceBody(serviceNode);
        serviceNode.range = new vscode.Range(startLine, 0, this.currentLine,
            this.lines[this.currentLine] ? this.lines[this.currentLine].length : 0);
        return serviceNode;
    }

    parseServiceBody(parent) {
        let braceCount = 0;
        const startLine = this.currentLine;

        // Find opening brace
        while (this.currentLine < this.lines.length) {
            const line = this.lines[this.currentLine];
            if (line.includes('{')) {
                braceCount++;
                break;
            }
            this.currentLine++;
        }

        this.currentLine++; // Move past opening brace

        // Parse functions until closing brace
        while (this.currentLine < this.lines.length && braceCount > 0) {
            const line = this.lines[this.currentLine];
            const trimmed = line.trim();

            if (trimmed.includes('{')) {
                braceCount++;
            }
            if (trimmed.includes('}')) {
                braceCount--;
                if (braceCount <= 0) {
                    this.currentLine++;
                    break;
                }
            }

            // Function: type name(args) throws (exceptions)
            // Simplified match: just look for return type and name and parens
            const funcMatch = trimmed.match(/^(?:(oneway)\s+)?([a-zA-Z0-9_<>.,\s]+)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/);
            if (funcMatch) {
                const funcNode = {
                    type: nodes.ThriftNodeType.Function,
                    range: new vscode.Range(this.currentLine, 0, this.currentLine, line.length),
                    parent: parent,
                    name: funcMatch[3],
                    returnType: funcMatch[2].trim(),
                    oneway: !!funcMatch[1],
                    arguments: [],
                    throws: []
                };

                parent.functions.push(funcNode);
            }

            this.currentLine++;
        }

        return this.currentLine;
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
        if (node.type === nodes.ThriftNodeType.Struct ||
            node.type === nodes.ThriftNodeType.Union ||
            node.type === nodes.ThriftNodeType.Exception) {
            console.log('Processing struct fields...');
            const struct = node;
            if (struct.fields) {
                struct.fields.forEach(field => {
                    console.log('Processing field:', field.name);
                    this.traverseAST(field, callback);
                });
            } else {
                console.log('No fields found in struct');
            }
        } else if (node.type === nodes.ThriftNodeType.Enum) {
            console.log('Processing enum members...');
            const enumNode = node;
            if (enumNode.members) {
                enumNode.members.forEach(member => {
                    console.log('Processing member:', member.name);
                    this.traverseAST(member, callback);
                });
            } else {
                console.log('No members found in enum');
            }
        } else if (node.type === nodes.ThriftNodeType.Service) {
            console.log('Processing service functions...');
            const service = node;
            if (service.functions) {
                service.functions.forEach(func => {
                    console.log('Processing function:', func.name);
                    this.traverseAST(func, callback);
                });
            } else {
                console.log('No functions found in service');
            }
        } else if (node.type === nodes.ThriftNodeType.Function) {
            console.log('Processing function args and throws...');
            const func = node;
            if (func.arguments) {
                func.arguments.forEach(arg => {
                    console.log('Processing argument:', arg.name);
                    this.traverseAST(arg, callback);
                });
            } else {
                console.log('No arguments found in function');
            }
            if (func.throws) {
                func.throws.forEach(throwNode => {
                    console.log('Processing throw:', throwNode.name);
                    this.traverseAST(throwNode, callback);
                });
            } else {
                console.log('No throws found in function');
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
            if (node.type === nodes.ThriftNodeType.Field) {
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

async function debugParser() {
    console.log('=== Debugging Parser ===\n');

    // 读取实际的测试文件
    const mainThriftPath = path.join(__dirname, 'tests', 'test-files', 'main.thrift');
    const sharedThriftPath = path.join(__dirname, 'tests', 'test-files', 'shared.thrift');

    try {
        const mainContent = fs.readFileSync(mainThriftPath, 'utf8');
        const sharedContent = fs.readFileSync(sharedThriftPath, 'utf8');

        console.log('Main.thrift content:');
        console.log(mainContent);
        console.log('\nShared.thrift content:');
        console.log(sharedContent);

        // 测试解析main.thrift
        console.log('\n=== Parsing main.thrift ===');
        const mainParser = new ThriftParser(mainContent);
        const mainAst = mainParser.parse();
        console.log('Main AST:', JSON.stringify(mainAst, null, 2));

        // 测试解析shared.thrift
        console.log('\n=== Parsing shared.thrift ===');
        const sharedParser = new ThriftParser(sharedContent);
        const sharedAst = sharedParser.parse();
        console.log('Shared AST:', JSON.stringify(sharedAst, null, 2));

        // 测试查找引用
        console.log('\n=== Finding references ===');
        const provider = new ThriftReferencesProvider();

        console.log('\nFinding references to "User" in main.thrift:');
        const userRefs = await provider.findReferencesInDocument('main.thrift', mainContent, 'User');
        console.log('User references:', userRefs);

        console.log('\nFinding references to "Address" in main.thrift:');
        const addressRefs = await provider.findReferencesInDocument('main.thrift', mainContent, 'Address');
        console.log('Address references:', addressRefs);

    } catch (error) {
        console.error('Error:', error);
        console.error('Error stack:', error.stack);
    }
}

// 运行调试
debugParser().catch(console.error);