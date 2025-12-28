import * as vscode from 'vscode';
import { ThriftParser } from './ast/parser';
import * as nodes from './ast/nodes';
import { ThriftFileWatcher } from '../utils/fileWatcher';
import { CacheManager } from '../utils/cacheManager';
import { ErrorHandler } from '../utils/errorHandler';
import { readThriftFile } from '../utils/fileReader';

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
        this.cacheManager.registerCache('references', {
            maxSize: 1000,
            ttl: 10000 // 10秒
        });
    }

    public async provideReferences(
        document: vscode.TextDocument,
        position: vscode.Position,
        context: vscode.ReferenceContext,
        token: vscode.CancellationToken
    ): Promise<vscode.Location[]> {

        // Check for cancellation immediately
        if (token.isCancellationRequested) {
            return [];
        }

        const references: vscode.Location[] = [];
        // 使用更精确的单词边界匹配
        const wordRange = document.getWordRangeAtPosition(position, /\b([A-Za-z_][A-Za-z0-9_]*)\b/);
        if (!wordRange) {
            return references;
        }

        const symbolName = document.getText(wordRange);
        const symbolType = await this.getSymbolType(document, position, symbolName);

        if (!symbolType) {
            return references;
        }


        // Check for cancellation before proceeding with document processing
        if (token.isCancellationRequested) {
            return [];
        }

        // 创建缓存键
        const cacheKey = `${document.uri.fsPath}:${symbolName}:${symbolType}`;
        const now = Date.now();

        // 使用缓存管理器检查缓存
        const cacheName = 'references';
        const cachedReferences = this.cacheManager.get<vscode.Location[]>(cacheName, cacheKey);
        if (cachedReferences) {
            return cachedReferences;
        }

        // Search in current document
        const currentDocRefs = await this.findReferencesInDocument(document.uri, document.getText(), symbolName, document.uri.fsPath, token);
        references.push(...currentDocRefs);

        // 限制全局扫描频率，避免频繁触发
        if (this.isScanning) {
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
                    const text = await readThriftFile(file);

                    const refs = await this.findReferencesInDocument(file, text, symbolName, document.uri.fsPath, token);
                    references.push(...refs);
                } catch (error) {
                    this.errorHandler.handleError(error, {
                        component: 'ThriftReferencesProvider',
                        operation: 'findReferencesInFile',
                        filePath: file?.fsPath || 'unknown',
                        additionalInfo: { symbolName }
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

        // Handle namespaced symbols (e.g., "shared.Address")
        if (symbolName.includes('.')) {
            const parts = symbolName.split('.');
            if (parts.length === 2) {
                const namespace = parts[0];
                const typeName = parts[1];

                // For namespaced symbols, we're interested in the type part
                // Check if this is a reference to the namespace itself or the type
                // If we're looking for the full namespaced symbol, treat it as a type
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
                // This is the namespace part of a namespaced type reference
                return 'namespace';
            }

            // Check if this word is preceded by a dot and another identifier (namespaced pattern)
            const beforeWord = lineText.substring(0, wordStart);
            const reverseBefore = beforeWord.split('').reverse().join('');
            const reversedNamespacePattern = /^[A-Za-z_][A-Za-z0-9_]*\s*\.\s*$/;
            if (reversedNamespacePattern.test(reverseBefore)) {
                // This is the namespace part of a namespaced type reference
                return 'namespace';
            }
        }

        // Use AST to determine symbol type with caching
        const ast = this.getCachedAst(document);

        // Find the node containing the position
        const node = this.findNodeAtPosition(ast, position);

        if (!node) {
            return null;
        }

        // Check if the symbol is a definition
        if (node.name === symbolName) {
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
                    return 'type';
                case nodes.ThriftNodeType.Field:
                    return 'field';
                case nodes.ThriftNodeType.Function:
                    return 'method';
                case nodes.ThriftNodeType.EnumMember:
                    return 'enumValue';
                default:
                    return null;
            }
        } else {

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
                                return 'field';
                            }

                            // Check if symbol is a field type within this struct
                            if (field.fieldType === symbolName) {
                                return 'type';
                            }

                            // Check for namespaced field types
                            if (field.fieldType.includes('.') && field.fieldType.endsWith('.' + symbolName)) {
                                return 'type';
                            }
                        }
                    }
                    break;
                case nodes.ThriftNodeType.Field:
                    // For field nodes, check if the symbol is the field type
                    const fieldNode = node as nodes.Field;
                    if (fieldNode.fieldType === symbolName) {
                        return 'type';
                    }

                    // Check for namespaced field types
                    if (fieldNode.fieldType.includes('.') && fieldNode.fieldType.endsWith('.' + symbolName)) {
                        return 'type';
                    }

                    // Special handling for namespaced types in field definitions
                    // When we're looking for "Address" in "shared.Address", we need to check if this field uses that type
                    if (fieldNode.fieldType.includes('.')) {
                        const parts = fieldNode.fieldType.split('.');
                        if (parts.length === 2 && parts[1] === symbolName) {
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
                                return 'method';
                            }

                            // Check if symbol is a function return type or parameter type
                            if (func.returnType === symbolName) {
                                return 'type';
                            }

                            // Check for namespaced return types
                            if (func.returnType.includes('.') && func.returnType.endsWith('.' + symbolName)) {
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
                        return 'type';
                    }

                    // Check for namespaced return types
                    if (funcNode.returnType.includes('.') && funcNode.returnType.endsWith('.' + symbolName)) {
                        return 'type';
                    }

                    // Note: Function parameter types are not included in reference search per test requirements
                    // Only return types and type definitions should be considered references
                    break;
                default:
                    // For all other node types, we consider them as potentially containing searchable child elements
                    // This prevents prematurely returning null when we might find the symbol in child elements
                    break;
            }
        }

        return null;
    }

    private findNodeAtPosition(doc: nodes.ThriftDocument, position: vscode.Position): nodes.ThriftNode | undefined {
        const rangeContains = (range: vscode.Range | { start: vscode.Position; end: vscode.Position } | undefined, pos: vscode.Position): boolean => {
            if (!range) {
                return false;
            }
            if (typeof (range as vscode.Range).contains === 'function') {
                return (range as vscode.Range).contains(pos);
            }
            const start = range.start;
            const end = range.end;
            return pos.line >= start.line &&
                pos.line <= end.line &&
                (pos.line !== start.line || pos.character >= start.character) &&
                (pos.line !== end.line || pos.character <= end.character);
        };

        // Find the deepest node that contains the position
        function findDeepestNode(nodesArray: nodes.ThriftNode[]): nodes.ThriftNode | undefined {
            for (const node of nodesArray) {
                if (rangeContains(node.range as vscode.Range, position)) {
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

    private async findReferencesInDocument(uri: vscode.Uri, text: string, symbolName: string, originalNamespace: string = '', token?: vscode.CancellationToken): Promise<vscode.Location[]> {

        // Check for cancellation immediately
        if (token && token.isCancellationRequested) {
            return [];
        }

        const references: vscode.Location[] = [];

        // 尝试使用缓存的AST
        let ast: nodes.ThriftDocument;
        try {
            // 直接使用提供的文本来解析AST
            const parser = new ThriftParser(text);
            ast = parser.parse();


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
                    inFunctionArguments = false;
                    inFunctionThrows = false;
                    currentArgument = null;
                    inServiceFunction = true;
                } else {
                    currentFunction = null;
                    inFunctionArguments = false;
                    inFunctionThrows = false;
                    currentArgument = null;
                    inServiceFunction = false;
                }
            }

            // Handle argument/throws fields only when they belong to a function
            if (node.type === nodes.ThriftNodeType.Field) {
                if (entering) {
                    const field = node as nodes.Field;
                    if (currentFunction && currentFunction.arguments && currentFunction.arguments.includes(field)) {
                        inFunctionArguments = true;
                        inFunctionThrows = false;
                        inServiceFunction = true;
                        currentArgument = field;
                    } else if (currentFunction && currentFunction.throws && currentFunction.throws.includes(field)) {
                        inFunctionArguments = false;
                        inFunctionThrows = true;
                        inServiceFunction = true;
                        currentArgument = field;
                    } else {
                        inFunctionArguments = false;
                        inFunctionThrows = false;
                        currentArgument = null;
                    }
                } else {
                    inFunctionArguments = false;
                    inFunctionThrows = false;
                    currentArgument = null;
                }
            }

            // Handle function nodes specifically to track throws context
            if (node.type === nodes.ThriftNodeType.Function) {
                if (entering) {
                } else {
                    // When exiting function node, ensure we're not in throws context
                    inFunctionThrows = false;
                }
            }
        };

        // Traverse the AST to find references
        this.traverseAST(ast, (node) => {

            // Check if this node is the actual definition of the symbol
            const isDefinitionNode = (n: nodes.ThriftNode) => {
                const definitionTypes = [nodes.ThriftNodeType.Struct, nodes.ThriftNodeType.Union, nodes.ThriftNodeType.Exception, nodes.ThriftNodeType.Enum, nodes.ThriftNodeType.Service, nodes.ThriftNodeType.Typedef, nodes.ThriftNodeType.Const];
                return definitionTypes.includes(n.type);
            };

            if (node.name === symbolName && isDefinitionNode(node)) {
                // Add definition nodes to references
                const location = new vscode.Location(uri, node.range);
                references.push(location);
                return; // Don't process children of definition nodes
            }

            // Skip references found in function throws clauses per test requirements
            if (inFunctionThrows) {
                return;
            }

            // Handle function return types specifically - only when not in function arguments
            if (node.type === nodes.ThriftNodeType.Function) {
                const func = node as nodes.ThriftFunction;
                if (func.returnType === symbolName) {
                    const location = new vscode.Location(uri, func.range);
                    references.push(location);
                }

                // Handle namespaced return types
                if (func.returnType.includes('.') && func.returnType.endsWith('.' + symbolName)) {
                    const location = new vscode.Location(uri, func.range);
                    references.push(location);
                }
                return; // Don't process children of Function nodes here as they are handled in traverseAST
            }

            // For field types, we need special handling
            // But we should skip field types when we're in function arguments context
            if (node.type === nodes.ThriftNodeType.Field) {
                const field = node as nodes.Field;
                // Skip field type references when in function arguments context
                if (!inFunctionArguments) {
                    if (field.fieldType === symbolName) {
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
                                // For namespace references, we create a location at the namespace part
                                const location = new vscode.Location(uri, field.range);
                                references.push(location);
                            } else if (typeName === symbolName) {
                                // For type references, we create a location at the type part
                                const location = new vscode.Location(uri, field.range);
                                references.push(location);
                            }
                        }
                    }
                } else {
                }
                return; // Don't process children of Field nodes here as they are handled in traverseAST
            }

            // Skip the original definition node
            // Only count references, not definitions or declarations
        }, contextCallback);

        return references;
    }

    private logAST(node: nodes.ThriftNode, depth: number): void {
        const indent = '  '.repeat(depth);

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
            const files = await vscode.workspace.findFiles('**/*.thrift', '**/node_modules/**', 1000);
            this.workspaceFileList = files.map(f => f.fsPath);
            this.lastFileListUpdate = now;
            return files;
        } else {
            // 使用缓存的文件列表
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
            return cached.ast;
        }

        // 解析新的AST
        const parser = new ThriftParser(document);
        const ast = parser.parse();

        // 更新缓存
        this.astCache.set(cacheKey, { ast, timestamp: now });

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
