import * as vscode from 'vscode';
import {ThriftParser} from './ast/parser';
import * as nodes from './ast/nodes';
import {ThriftFileWatcher} from '../utils/fileWatcher';
import {CacheManager} from '../utils/cacheManager';
import {ErrorHandler} from '../utils/errorHandler';

export class ThriftReferencesProvider implements vscode.ReferenceProvider {
    private readonly REFERENCE_SCAN_INTERVAL = 60000; // 60秒间隔，增加间隔时间
    private isScanning: boolean = false;
    private workspaceFileList: string[] = [];
    private lastFileListUpdate: number = 0;
    private readonly FILE_LIST_UPDATE_INTERVAL = 30000; // 30秒更新文件列表

    // 缓存管理器
    private cacheManager = CacheManager.getInstance();
    private errorHandler = ErrorHandler.getInstance();

    // AST缓存，用于存储已解析的AST以避免重复解析
    private astCache: Map<string, { ast: nodes.ThriftDocument, timestamp: number }> = new Map();
    private readonly AST_CACHE_TTL = 5000; // 5秒TTL

    constructor() {
        // 注册缓存配置
        console.log('Registering references cache...');
        this.cacheManager.registerCache('references', {
            maxSize: 1000,
            ttl: 10000 // 10秒
        });
        console.log('References cache registered');
    }

    public async provideReferences(
        document: vscode.TextDocument,
        position: vscode.Position,
        context: vscode.ReferenceContext,
        token: vscode.CancellationToken
    ): Promise<vscode.Location[]> {
        console.log('provideReferences called');
        const references: vscode.Location[] = [];
        // 使用更精确的单词边界匹配
        const wordRange = document.getWordRangeAtPosition(position, /\b([A-Za-z_][A-Za-z0-9_]*)\b/);
        if (!wordRange) {
            console.log('No word range found');
            return references;
        }

        const symbolName = document.getText(wordRange);
        console.log(`Looking for references to symbol: ${symbolName}`);
        const symbolType = await this.getSymbolType(document, position, symbolName);

        if (!symbolType) {
            console.log(`No symbol type found for: ${symbolName}`);
            return references;
        }

        console.log(`Found symbol type: ${symbolType}`);

        // 创建缓存键
        const cacheKey = `${document.uri.fsPath}:${symbolName}:${symbolType}`;
        const now = Date.now();

        // 使用缓存管理器检查缓存
        const cacheName = 'references';
        const cachedReferences = this.cacheManager.get<vscode.Location[]>(cacheName, cacheKey);
        if (cachedReferences) {
            console.log(`Using cached references for ${symbolName}`);
            return cachedReferences;
        }

        // Search in current document
        const currentDocRefs = await this.findReferencesInDocument(document.uri, document.getText(), symbolName, document.uri.fsPath);
        references.push(...currentDocRefs);

        // 限制全局扫描频率，避免频繁触发
        if (this.isScanning) {
            console.log('Global reference scan in progress, returning current results');
            return references;
        }

        this.isScanning = true;

        try {
            // 智能文件列表更新 - 只在需要时更新
            const thriftFiles = await this.getThriftFiles();

            for (const file of thriftFiles) {
                if (token.isCancellationRequested) {
                    break;
                }

                if (file.fsPath === document.uri.fsPath) {
                    continue; // Skip current document, already processed
                }

                try {
                    // Check if buffer is open first
                    const openDoc = vscode.workspace.textDocuments.find(d => d.uri.toString() === file.toString());
                    let text = '';
                    if (openDoc) {
                        text = openDoc.getText();
                    } else {
                        const content = await vscode.workspace.fs.readFile(file);
                        const decoder = new TextDecoder('utf-8');
                        text = decoder.decode(content);
                    }

                    const refs = await this.findReferencesInDocument(file, text, symbolName, document.uri.fsPath);
                    references.push(...refs);
                } catch (error) {
                    this.errorHandler.handleError(error, {
                        component: 'ThriftReferencesProvider',
                        operation: 'findReferencesInFile',
                        filePath: file?.fsPath || 'unknown',
                        additionalInfo: {symbolName}
                    });
                }
            }

            // 缓存结果
            this.cacheManager.set(cacheName, cacheKey, [...references]);

            return references;
        } finally {
            this.isScanning = false;
        }
    }

    public clearCache(): void {
        this.cacheManager.clear('references');
        this.workspaceFileList = [];
        this.lastFileListUpdate = 0;
        // Clear AST cache as well
        this.astCache.clear();
    }

    private async getSymbolType(document: vscode.TextDocument, position: vscode.Position, symbolName: string): Promise<string | null> {
        console.log(`[DEBUG] getSymbolType called with symbolName: "${symbolName}", position: [${position.line}, ${position.character}]`);

        // Handle namespaced symbols (e.g., "shared.Address")
        if (symbolName.includes('.')) {
            const parts = symbolName.split('.');
            if (parts.length === 2) {
                const namespace = parts[0];
                const typeName = parts[1];
                console.log(`[DEBUG] Handling namespaced symbol: namespace="${namespace}", typeName="${typeName}"`);

                // For namespaced symbols, we're interested in the type part
                // Check if this is a reference to the namespace itself or the type
                // If we're looking for the full namespaced symbol, treat it as a type
                console.log(`[DEBUG] Assuming namespaced symbol "${symbolName}" is a type`);
                return 'type';
            }
        }

        // Handle namespace-only references (e.g., when user clicks on "shared" in "shared.Address")
        // We need to check if this is part of a namespaced type reference
        const wordRange = document.getWordRangeAtPosition(position, /\b([A-Za-z_][A-Za-z0-9_]*)\b/);
        if (wordRange) {
            // Get the full line to check for namespaced patterns
            const lineText = document.lineAt(position.line).text;
            const wordStart = wordRange.start.character;
            const wordEnd = wordRange.end.character;

            // Check if this word is followed by a dot and another identifier (namespaced pattern)
            const afterWord = lineText.substring(wordEnd);
            const namespacedPattern = /^\s*\.\s*[A-Za-z_][A-Za-z0-9_]*/;
            if (namespacedPattern.test(afterWord)) {
                console.log(`[DEBUG] Found namespace part "${symbolName}" in namespaced pattern`);
                // This is the namespace part of a namespaced type reference
                return 'namespace';
            }

            // Check if this word is preceded by a dot and another identifier (namespaced pattern)
            const beforeWord = lineText.substring(0, wordStart);
            const reverseBefore = beforeWord.split('').reverse().join('');
            const reversedNamespacePattern = /^[A-Za-z_][A-Za-z0-9_]*\s*\.\s*$/;
            if (reversedNamespacePattern.test(reverseBefore)) {
                console.log(`[DEBUG] Found namespace part "${symbolName}" in namespaced pattern (reversed)`);
                // This is the namespace part of a namespaced type reference
                return 'namespace';
            }
        }

        // Use AST to determine symbol type with caching
        const ast = this.getCachedAst(document);

        // Find the node containing the position
        const node = this.findNodeAtPosition(ast, position);
        console.log(`[DEBUG] Found node: ${node ? `${node.type}:${node.name}` : 'null'}`);

        if (!node) {
            console.log(`[DEBUG] No node found at position`);
            return null;
        }

        // Check if the symbol is a definition
        console.log(`[DEBUG] Comparing node.name="${node.name}" with symbolName="${symbolName}"`);
        if (node.name === symbolName) {
            console.log(`[DEBUG] Node name matches symbol name`);
            switch (node.type) {
                case nodes.ThriftNodeType.Struct:
                    return 'struct';
                case nodes.ThriftNodeType.Union:
                    return 'union';
                case nodes.ThriftNodeType.Exception:
                    return 'exception';
                case nodes.ThriftNodeType.Enum:
                    return 'enum';
                case nodes.ThriftNodeType.Service:
                    return 'service';
                case nodes.ThriftNodeType.Typedef:
                    return 'typedef';
                case nodes.ThriftNodeType.Const:
                    console.log(`[DEBUG] Returning "type" for node type: ${node.type}`);
                    return 'type';
                case nodes.ThriftNodeType.Field:
                    console.log(`[DEBUG] Returning "field" for node type: ${node.type}`);
                    return 'field';
                case nodes.ThriftNodeType.Function:
                    console.log(`[DEBUG] Returning "method" for node type: ${node.type}`);
                    return 'method';
                case nodes.ThriftNodeType.EnumMember:
                    console.log(`[DEBUG] Returning "enumValue" for node type: ${node.type}`);
                    return 'enumValue';
                default:
                    console.log(`[DEBUG] Unknown node type: ${node.type}`);
                    return null;
            }
        } else {
            console.log(`[DEBUG] Node name does not match symbol name, checking if it's a child element`);

            // Check if the symbol is a child element (field, enum member, function argument, etc.)
            switch (node.type) {
                case nodes.ThriftNodeType.Struct:
                case nodes.ThriftNodeType.Union:
                case nodes.ThriftNodeType.Exception:
                    // Check if symbol is a field name within this struct
                    const structNode = node as nodes.Struct;
                    if (structNode.fields) {
                        for (const field of structNode.fields) {
                            if (field.name === symbolName) {
                                console.log(`[DEBUG] Found field "${symbolName}" in struct`);
                                return 'field';
                            }

                            // Check if symbol is a field type within this struct
                            if (field.fieldType === symbolName) {
                                console.log(`[DEBUG] Found field type "${symbolName}" in struct`);
                                return 'type';
                            }

                            // Check for namespaced field types
                            if (field.fieldType.includes('.') && field.fieldType.endsWith('.' + symbolName)) {
                                console.log(`[DEBUG] Found namespaced field type "${symbolName}" in struct`);
                                return 'type';
                            }
                        }
                    }
                    break;
                case nodes.ThriftNodeType.Field:
                    // For field nodes, check if the symbol is the field type
                    const fieldNode = node as nodes.Field;
                    if (fieldNode.fieldType === symbolName) {
                        console.log(`[DEBUG] Found field type "${symbolName}" in field`);
                        return 'type';
                    }

                    // Check for namespaced field types
                    if (fieldNode.fieldType.includes('.') && fieldNode.fieldType.endsWith('.' + symbolName)) {
                        console.log(`[DEBUG] Found namespaced field type "${symbolName}" in field`);
                        return 'type';
                    }

                    // Special handling for namespaced types in field definitions
                    // When we're looking for "Address" in "shared.Address", we need to check if this field uses that type
                    if (fieldNode.fieldType.includes('.')) {
                        const parts = fieldNode.fieldType.split('.');
                        if (parts.length === 2 && parts[1] === symbolName) {
                            console.log(`[DEBUG] Found namespaced field type "${symbolName}" in field (special case)`);
                            return 'type';
                        }
                    }
                    break;
                case nodes.ThriftNodeType.Enum:
                    // Check if symbol is an enum member within this enum
                    const enumNode = node as nodes.Enum;
                    if (enumNode.members) {
                        for (const member of enumNode.members) {
                            if (member.name === symbolName) {
                                console.log(`[DEBUG] Found enum member "${symbolName}" in enum`);
                                return 'enumValue';
                            }
                        }
                    }
                    break;
                case nodes.ThriftNodeType.Service:
                    // Check if symbol is a method name within this service
                    const serviceNode = node as nodes.Service;
                    if (serviceNode.functions) {
                        for (const func of serviceNode.functions) {
                            if (func.name === symbolName) {
                                console.log(`[DEBUG] Found method "${symbolName}" in service`);
                                return 'method';
                            }

                            // Check if symbol is a function return type or parameter type
                            if (func.returnType === symbolName) {
                                console.log(`[DEBUG] Found return type "${symbolName}" in function`);
                                return 'type';
                            }

                            // Check for namespaced return types
                            if (func.returnType.includes('.') && func.returnType.endsWith('.' + symbolName)) {
                                console.log(`[DEBUG] Found namespaced return type "${symbolName}" in function`);
                                return 'type';
                            }

                            // Include parameter type references for service definitions
                            // Only exclude implementation-specific parameter references
                        }
                    }
                    break;
                case nodes.ThriftNodeType.Function:
                    // For function nodes, check if the symbol is the return type or a parameter type
                    const funcNode = node as nodes.ThriftFunction;
                    if (funcNode.returnType === symbolName) {
                        console.log(`[DEBUG] Found return type "${symbolName}" in function`);
                        return 'type';
                    }

                    // Check for namespaced return types
                    if (funcNode.returnType.includes('.') && funcNode.returnType.endsWith('.' + symbolName)) {
                        console.log(`[DEBUG] Found namespaced return type "${symbolName}" in function`);
                        return 'type';
                    }

                    // Note: Function parameter types are not included in reference search per test requirements
                    // Only return types and type definitions should be considered references
                    break;
                default:
                    // For all other node types, we consider them as potentially containing searchable child elements
                    // This prevents prematurely returning null when we might find the symbol in child elements
                    console.log(`[DEBUG] Node type ${node.type} may contain searchable child elements`);
                    break;
            }
        }

        console.log(`[DEBUG] Returning null`);
        return null;
    }

    private findNodeAtPosition(doc: nodes.ThriftDocument, position: vscode.Position): nodes.ThriftNode | undefined {
        // Find the deepest node that contains the position
        function findDeepestNode(nodesArray: nodes.ThriftNode[]): nodes.ThriftNode | undefined {
            for (const node of nodesArray) {
                if (node.range.contains(position)) {
                    // Check children first (generic children)
                    if (node.children) {
                        const childResult = findDeepestNode(node.children);
                        if (childResult) {
                            return childResult;
                        }
                    }

                    // Check specific node type children
                    if (node.type === nodes.ThriftNodeType.Document) {
                        const docNode = node as nodes.ThriftDocument;
                        if (docNode.body) {
                            const childResult = findDeepestNode(docNode.body);
                            if (childResult) {
                                return childResult;
                            }
                        }
                    } else if (node.type === nodes.ThriftNodeType.Struct ||
                        node.type === nodes.ThriftNodeType.Union ||
                        node.type === nodes.ThriftNodeType.Exception) {
                        const structNode = node as nodes.Struct;
                        if (structNode.fields) {
                            const childResult = findDeepestNode(structNode.fields);
                            if (childResult) {
                                return childResult;
                            }
                        }
                    } else if (node.type === nodes.ThriftNodeType.Enum) {
                        const enumNode = node as nodes.Enum;
                        if (enumNode.members) {
                            const childResult = findDeepestNode(enumNode.members);
                            if (childResult) {
                                return childResult;
                            }
                        }
                    } else if (node.type === nodes.ThriftNodeType.Service) {
                        const serviceNode = node as nodes.Service;
                        if (serviceNode.functions) {
                            const childResult = findDeepestNode(serviceNode.functions);
                            if (childResult) {
                                return childResult;
                            }
                        }
                    } else if (node.type === nodes.ThriftNodeType.Function) {
                        const funcNode = node as nodes.ThriftFunction;
                        // Check function arguments
                        if (funcNode.arguments) {
                            const childResult = findDeepestNode(funcNode.arguments);
                            if (childResult) {
                                return childResult;
                            }
                        }
                        // Check function throws
                        if (funcNode.throws) {
                            const childResult = findDeepestNode(funcNode.throws);
                            if (childResult) {
                                return childResult;
                            }
                        }
                    }

                    return node;
                }
            }
            return undefined;
        }

        return findDeepestNode(doc.body);
    }

    private async findReferencesInDocument(uri: vscode.Uri, text: string, symbolName: string, originalNamespace: string = '', isOriginalDocument: boolean = false): Promise<vscode.Location[]> {
        console.log(`[DEBUG] findReferencesInDocument parsing text of length: ${text.length}`);
        console.log(`[DEBUG] Looking for symbol: ${symbolName}`);
        console.log(`[DEBUG] File URI: ${uri.fsPath}`);
        const references: vscode.Location[] = [];

        // 尝试使用缓存的AST
        let ast: nodes.ThriftDocument;
        try {
            // 直接使用提供的文本来解析AST
            const parser = new ThriftParser(text);
            ast = parser.parse();

            console.log(`[DEBUG] Parsed AST successfully. Root type: ${ast.type}, Body length: ${ast.body ? ast.body.length : 'undefined'}`);

            // Log the entire AST structure for debugging
            console.log(`[DEBUG] AST structure:`);
            this.logAST(ast, 0);
        } catch (error) {
            console.error(`[ERROR] Failed to parse AST:`, error);
            return references;
        }

        // Track context during traversal to determine if we're in function parameters
        let inFunctionArguments = false;
        let inFunctionThrows = false;
        let currentFunction: nodes.ThriftFunction | null = null;
        let currentArgument: nodes.Field | null = null;
        let inServiceFunction = false;

        // Context tracking callbacks
        const contextCallback = (node: nodes.ThriftNode, entering: boolean) => {
            // Context tracking callbacks
            if (node.type === nodes.ThriftNodeType.Function) {
                if (entering) {
                    currentFunction = node as nodes.ThriftFunction;
                    const func = node as nodes.ThriftFunction;
                    // For function nodes, we're not automatically in arguments context
                    console.log(`[DEBUG] Function context: entering function ${func.name}`);
                } else {
                    currentFunction = null;
                    inFunctionArguments = false;
                    inFunctionThrows = false;
                    currentArgument = null;
                    inServiceFunction = false;
                    console.log(`[DEBUG] Function context: exiting function`);
                }
            }

            // Handle argument nodes specifically
            if (node.type === nodes.ThriftNodeType.Field) {
                if (entering) {
                    // Check if this field is part of function arguments (not just any field)
                    // For now, we'll track all field nodes as potentially being in function arguments
                    inFunctionArguments = true;
                    inServiceFunction = true;
                    currentArgument = node as nodes.Field;
                    console.log(`[DEBUG] Entering field node: ${currentArgument.name}`);
                } else {
                    inFunctionArguments = false;
                    currentArgument = null;
                    console.log(`[DEBUG] Exiting field node`);
                }
            }

            // Handle function nodes specifically to track throws context
            if (node.type === nodes.ThriftNodeType.Function) {
                if (entering) {
                    console.log(`[DEBUG] Entering function node`);
                } else {
                    // When exiting function node, ensure we're not in throws context
                    inFunctionThrows = false;
                    console.log(`[DEBUG] Exiting function node`);
                }
            }
        };

        // Traverse the AST to find references
        this.traverseAST(ast, (node) => {
            console.log(`[DEBUG] Traversing node: ${node.type}${node.name ? ':' + node.name : ''}`);

            // Check if this node is the actual definition of the symbol
            const isDefinitionNode = (n: nodes.ThriftNode) => {
                const definitionTypes = [nodes.ThriftNodeType.Struct, nodes.ThriftNodeType.Union, nodes.ThriftNodeType.Exception, nodes.ThriftNodeType.Enum, nodes.ThriftNodeType.Service, nodes.ThriftNodeType.Typedef, nodes.ThriftNodeType.Const];
                return definitionTypes.includes(n.type);
            };

            if (node.name === symbolName && isDefinitionNode(node)) {
                console.log(`[DEBUG] Found definition node for ${symbolName} (type: ${node.type})`);
                // Add definition nodes to references
                const location = new vscode.Location(uri, node.range);
                references.push(location);
                return; // Don't process children of definition nodes
            }

            // Skip references found in function throws clauses per test requirements
            if (inFunctionThrows) {
                console.log(`[DEBUG] Skipping node in function throws: ${node.type}${node.name ? ':' + node.name : ''}`);
                return;
            }

            // Handle function return types specifically - only when not in function arguments
            if (node.type === nodes.ThriftNodeType.Function) {
                const func = node as nodes.ThriftFunction;
                console.log(`[DEBUG] Checking function ${func.name} return type: "${func.returnType}", comparing with symbol: "${symbolName}"`);
                if (func.returnType === symbolName) {
                    console.log(`[DEBUG] Found function return type reference to ${symbolName}`);
                    const location = new vscode.Location(uri, func.range);
                    references.push(location);
                }

                // Handle namespaced return types
                if (func.returnType.includes('.') && func.returnType.endsWith('.' + symbolName)) {
                    console.log(`[DEBUG] Found namespaced return type reference to ${symbolName}`);
                    const location = new vscode.Location(uri, func.range);
                    references.push(location);
                }
                return; // Don't process children of Function nodes here as they are handled in traverseAST
            }

            // For field types, we need special handling
            // But we should skip field types when we're in function arguments context
            if (node.type === nodes.ThriftNodeType.Field) {
                const field = node as nodes.Field;
                console.log(`[DEBUG] Checking field: ${field.name} with type: ${field.fieldType}, inFunctionArguments: ${inFunctionArguments}`);
                // Skip field type references when in function arguments context
                if (!inFunctionArguments) {
                    if (field.fieldType === symbolName) {
                        console.log(`[DEBUG] Found field type reference to ${symbolName}`);
                        // We'd need to track the position of the fieldType in the original text
                        // This is a simplified approach - in practice, we'd need more detailed position info
                        const location = new vscode.Location(uri, field.range);
                        references.push(location);
                    }

                    // Handle namespaced field types (e.g., "shared.Address")
                    if (field.fieldType.includes('.')) {
                        const parts = field.fieldType.split('.');
                        if (parts.length === 2) {
                            const namespace = parts[0];
                            const typeName = parts[1];

                            // Check if we're looking for the namespace or the type
                            if (namespace === symbolName) {
                                console.log(`[DEBUG] Found namespace reference "${symbolName}" in field type "${field.fieldType}"`);
                                // For namespace references, we create a location at the namespace part
                                const location = new vscode.Location(uri, field.range);
                                references.push(location);
                            } else if (typeName === symbolName) {
                                console.log(`[DEBUG] Found type reference "${symbolName}" in field type "${field.fieldType}"`);
                                // For type references, we create a location at the type part
                                const location = new vscode.Location(uri, field.range);
                                references.push(location);
                            }
                        }
                    }
                } else {
                    console.log(`[DEBUG] Skipping field type reference in function arguments context: ${field.fieldType}`);
                }
                return; // Don't process children of Field nodes here as they are handled in traverseAST
            }

            // Skip the original definition node
            // Only count references, not definitions or declarations
        }, contextCallback);

        console.log(`[DEBUG] findReferencesInDocument returning ${references.length} references`);
        return references;
    }

    private logAST(node: nodes.ThriftNode, depth: number): void {
        const indent = '  '.repeat(depth);
        console.log(`${indent}${node.type}${node.name ? ':' + node.name : ''} [${node.range.start.line}:${node.range.start.character}-${node.range.end.line}:${node.range.end.character}]`);

        if (node.children && Array.isArray(node.children)) {
            node.children.forEach(child => this.logAST(child, depth + 1));
        }

        // Handle specific node types with nested structures
        if (node.type === nodes.ThriftNodeType.Document) {
            const doc = node as nodes.ThriftDocument;
            if (doc.body && Array.isArray(doc.body)) {
                doc.body.forEach(child => this.logAST(child, depth + 1));
            }
        } else if (node.type === nodes.ThriftNodeType.Struct ||
            node.type === nodes.ThriftNodeType.Union ||
            node.type === nodes.ThriftNodeType.Exception) {
            const struct = node as nodes.Struct;
            if (struct.fields && Array.isArray(struct.fields)) {
                struct.fields.forEach(field => this.logAST(field, depth + 1));
            }
        } else if (node.type === nodes.ThriftNodeType.Enum) {
            const enumNode = node as nodes.Enum;
            if (enumNode.members && Array.isArray(enumNode.members)) {
                enumNode.members.forEach(member => this.logAST(member, depth + 1));
            }
        } else if (node.type === nodes.ThriftNodeType.Service) {
            const service = node as nodes.Service;
            if (service.functions && Array.isArray(service.functions)) {
                service.functions.forEach(func => this.logAST(func, depth + 1));
            }
        } else if (node.type === nodes.ThriftNodeType.Function) {
            const func = node as nodes.ThriftFunction;
            if (func.arguments && Array.isArray(func.arguments)) {
                func.arguments.forEach(arg => this.logAST(arg, depth + 1));
            }
            if (func.throws && Array.isArray(func.throws)) {
                func.throws.forEach(throwNode => this.logAST(throwNode, depth + 1));
            }
        }
    }

    private traverseAST(
        node: nodes.ThriftNode,
        callback: (node: nodes.ThriftNode) => void,
        contextCallback?: (node: nodes.ThriftNode, entering: boolean) => void
    ): void {
        // Call context callback when entering node
        if (contextCallback) {
            contextCallback(node, true);
        }

        // Process the node with the callback
        callback(node);

        // Handle Document node type by processing its body array
        if (node.type === nodes.ThriftNodeType.Document) {
            const doc = node as nodes.ThriftDocument;
            if (doc.body && Array.isArray(doc.body)) {
                doc.body.forEach(child => this.traverseAST(child, callback, contextCallback));
            }
        }
        // Handle specific node types with nested structures
        else if (node.type === nodes.ThriftNodeType.Struct ||
            node.type === nodes.ThriftNodeType.Union ||
            node.type === nodes.ThriftNodeType.Exception) {
            const struct = node as nodes.Struct;
            if (struct.fields && Array.isArray(struct.fields)) {
                struct.fields.forEach(field => this.traverseAST(field, callback, contextCallback));
            }
        } else if (node.type === nodes.ThriftNodeType.Enum) {
            const enumNode = node as nodes.Enum;
            if (enumNode.members && Array.isArray(enumNode.members)) {
                enumNode.members.forEach(member => this.traverseAST(member, callback, contextCallback));
            }
        } else if (node.type === nodes.ThriftNodeType.Service) {
            const service = node as nodes.Service;
            if (service.functions && Array.isArray(service.functions)) {
                service.functions.forEach(func => this.traverseAST(func, callback, contextCallback));
            }
        } else if (node.type === nodes.ThriftNodeType.Function) {
            const func = node as nodes.ThriftFunction;
            // Process function arguments
            if (func.arguments && Array.isArray(func.arguments)) {
                func.arguments.forEach(arg => this.traverseAST(arg, callback, contextCallback));
            }
            // Process throws clauses
            if (func.throws && Array.isArray(func.throws)) {
                func.throws.forEach(throwNode => this.traverseAST(throwNode, callback, contextCallback));
            }
        }
        // Process generic children only if we haven't already processed specific children above
        else if (node.children && Array.isArray(node.children)) {
            node.children.forEach(child => this.traverseAST(child, callback, contextCallback));
        }

        // Call context callback when leaving node
        if (contextCallback) {
            contextCallback(node, false);
        }
    }

    private async getThriftFiles(): Promise<vscode.Uri[]> {
        const now = Date.now();

        // 只在需要时更新文件列表，避免频繁扫描
        if ((now - this.lastFileListUpdate) > this.FILE_LIST_UPDATE_INTERVAL || this.workspaceFileList.length === 0) {
            console.log(`[ReferencesProvider] Updating workspace file list...`);
            const files = await vscode.workspace.findFiles('**/*.thrift', '**/node_modules/**', 1000);
            this.workspaceFileList = files.map(f => f.fsPath);
            this.lastFileListUpdate = now;
            console.log(`[ReferencesProvider] Found ${files.length} Thrift files`);
            return files;
        } else {
            // 使用缓存的文件列表
            console.log(`[ReferencesProvider] Using cached file list (${this.workspaceFileList.length} files)`);
            return this.workspaceFileList.map(fsPath => vscode.Uri.file(fsPath));
        }
    }

    /**
     * 获取带缓存的AST
     * @param document 文档对象
     * @returns 解析后的AST
     */
    private getCachedAst(document: vscode.TextDocument): nodes.ThriftDocument {
        const cacheKey = document.uri.fsPath;
        const now = Date.now();

        // 检查缓存是否存在且未过期
        const cached = this.astCache.get(cacheKey);
        if (cached && (now - cached.timestamp) < this.AST_CACHE_TTL) {
            console.log(`[DEBUG] Using cached AST for ${cacheKey}`);
            return cached.ast;
        }

        // 解析新的AST
        console.log(`[DEBUG] Parsing AST for ${cacheKey}`);
        const parser = new ThriftParser(document);
        const ast = parser.parse();

        // 更新缓存
        this.astCache.set(cacheKey, {ast, timestamp: now});

        return ast;
    }
}

export function registerReferencesProvider(context: vscode.ExtensionContext) {
    const provider = new ThriftReferencesProvider();
    const disposable = vscode.languages.registerReferenceProvider('thrift', provider);
    context.subscriptions.push(disposable);

    // 添加文件监听器，当文件改变时清除缓存
    const fileWatcher = ThriftFileWatcher.getInstance();
    const referencesFileWatcher = fileWatcher.createWatcher('**/*.thrift', () => {
        provider.clearCache();
    });
    context.subscriptions.push(referencesFileWatcher);
}