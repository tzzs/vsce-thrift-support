import * as vscode from 'vscode';
import * as path from 'path';
import { ThriftParser } from './ast/parser';
import * as nodes from './ast/nodes';

export class ThriftReferencesProvider implements vscode.ReferenceProvider {
    private cachedReferences: Map<string, vscode.Location[]> = new Map();
    private lastReferenceScan: Map<string, number> = new Map();
    private readonly REFERENCE_SCAN_INTERVAL = 60000; // 60秒间隔，增加间隔时间
    private isScanning: boolean = false;
    private workspaceFileList: string[] = [];
    private lastFileListUpdate: number = 0;
    private readonly FILE_LIST_UPDATE_INTERVAL = 30000; // 30秒更新文件列表

    public async provideReferences(
        document: vscode.TextDocument,
        position: vscode.Position,
        context: vscode.ReferenceContext,
        token: vscode.CancellationToken
    ): Promise<vscode.Location[]> {
        console.log('provideReferences called');
        const references: vscode.Location[] = [];
        const wordRange = document.getWordRangeAtPosition(position);
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

        // 检查是否可以使用缓存
        const lastScan = this.lastReferenceScan.get(cacheKey) || 0;
        if ((now - lastScan) < this.REFERENCE_SCAN_INTERVAL && this.cachedReferences.has(cacheKey)) {
            console.log(`Using cached references for ${symbolName}`);
            return this.cachedReferences.get(cacheKey)!;
        }

        // Search in current document
        const currentDocRefs = await this.findReferencesInDocument(document.uri, document.getText(), symbolName);
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

                    const refs = await this.findReferencesInDocument(file, text, symbolName);
                    references.push(...refs);
                } catch (error) {
                    console.error(`Error searching references in ${file.fsPath}:`, error);
                }
            }

            // 缓存结果
            this.cachedReferences.set(cacheKey, [...references]);
            this.lastReferenceScan.set(cacheKey, now);

            return references;
        } finally {
            this.isScanning = false;
        }
    }

    private async getSymbolType(document: vscode.TextDocument, position: vscode.Position, symbolName: string): Promise<string | null> {
        // Use AST to determine symbol type
        const parser = new ThriftParser(document);
        const ast = parser.parse();

        // Find the node containing the position
        const node = this.findNodeAtPosition(ast, position);
        if (!node) {
            return null;
        }

        // Check if the symbol is a definition
        if (node.name === symbolName) {
            switch (node.type) {
                case nodes.ThriftNodeType.Struct:
                case nodes.ThriftNodeType.Union:
                case nodes.ThriftNodeType.Exception:
                case nodes.ThriftNodeType.Enum:
                case nodes.ThriftNodeType.Service:
                case nodes.ThriftNodeType.Typedef:
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
        }

        return null;
    }

    private findNodeAtPosition(doc: nodes.ThriftDocument, position: vscode.Position): nodes.ThriftNode | undefined {
        // Find the deepest node that contains the position
        function findDeepestNode(nodesArray: nodes.ThriftNode[]): nodes.ThriftNode | undefined {
            for (const node of nodesArray) {
                if (node.range.contains(position)) {
                    // Check children first
                    if (node.children) {
                        const childResult = findDeepestNode(node.children);
                        if (childResult) {
                            return childResult;
                        }
                    }
                    return node;
                }
            }
            return undefined;
        }

        return findDeepestNode(doc.body);
    }

    private async findReferencesInDocument(uri: vscode.Uri, text: string, symbolName: string): Promise<vscode.Location[]> {
        const references: vscode.Location[] = [];
        const parser = new ThriftParser(text);
        const ast = parser.parse();

        // Traverse the AST to find references
        this.traverseAST(ast, (node) => {
            if (node.name === symbolName) {
                // Create a location for this reference
                const location = new vscode.Location(uri, node.range);
                references.push(location);
            }

            // For field types, we need special handling
            if (node.type === nodes.ThriftNodeType.Field) {
                const field = node as nodes.Field;
                if (field.fieldType === symbolName) {
                    // We'd need to track the position of the fieldType in the original text
                    // This is a simplified approach - in practice, we'd need more detailed position info
                    const location = new vscode.Location(uri, field.range);
                    references.push(location);
                }
            }
        });

        return references;
    }

    private traverseAST(node: nodes.ThriftNode, callback: (node: nodes.ThriftNode) => void): void {
        callback(node);

        if (node.children) {
            node.children.forEach(child => this.traverseAST(child, callback));
        }

        // Handle specific node types with nested structures
        if (node.type === nodes.ThriftNodeType.Struct ||
            node.type === nodes.ThriftNodeType.Union ||
            node.type === nodes.ThriftNodeType.Exception) {
            const struct = node as nodes.Struct;
            struct.fields.forEach(field => this.traverseAST(field, callback));
        } else if (node.type === nodes.ThriftNodeType.Enum) {
            const enumNode = node as nodes.Enum;
            enumNode.members.forEach(member => this.traverseAST(member, callback));
        } else if (node.type === nodes.ThriftNodeType.Service) {
            const service = node as nodes.Service;
            service.functions.forEach(func => this.traverseAST(func, callback));
        } else if (node.type === nodes.ThriftNodeType.Function) {
            const func = node as nodes.ThriftFunction;
            func.arguments.forEach(arg => this.traverseAST(arg, callback));
            func.throws.forEach(throwNode => this.traverseAST(throwNode, callback));
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

    public clearCache(): void {
        this.cachedReferences.clear();
        this.lastReferenceScan.clear();
        this.workspaceFileList = [];
        this.lastFileListUpdate = 0;
    }
}

export function registerReferencesProvider(context: vscode.ExtensionContext) {
    const provider = new ThriftReferencesProvider();
    const disposable = vscode.languages.registerReferenceProvider('thrift', provider);
    context.subscriptions.push(disposable);

    // 添加文件监听器，当文件改变时清除缓存
    const fileWatcher = vscode.workspace.createFileSystemWatcher('**/*.thrift');

    fileWatcher.onDidCreate(() => {
        provider.clearCache();
    });

    fileWatcher.onDidChange(() => {
        provider.clearCache();
    });

    fileWatcher.onDidDelete(() => {
        provider.clearCache();
    });

    context.subscriptions.push(fileWatcher);
}