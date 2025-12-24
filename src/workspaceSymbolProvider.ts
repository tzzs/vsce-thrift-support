import * as vscode from 'vscode';
import * as path from 'path';
import {ThriftFileWatcher} from '../utils/fileWatcher';
import {CacheManager} from '../utils/cacheManager';
import {ErrorHandler} from '../utils/errorHandler';

export class ThriftWorkspaceSymbolProvider implements vscode.WorkspaceSymbolProvider {
    private cacheManager = CacheManager.getInstance();
    private fileWatcher: vscode.FileSystemWatcher | undefined;
    private isScanning: boolean = false;
    private workspaceFileList: string[] = [];
    private lastFileListUpdate: number = 0;
    private readonly FILE_LIST_UPDATE_INTERVAL = 30000; // 30秒更新文件列表
    private errorHandler = ErrorHandler.getInstance();

    constructor() {
        // 注册缓存配置
        this.cacheManager.registerCache('workspaceSymbols', {
            maxSize: 1000,
            ttl: 60000 // 60秒
        });
        this.cacheManager.registerCache('fileSymbols', {
            maxSize: 500,
            ttl: 30000 // 30秒
        });

        // Watch for changes to Thrift files
        const fileWatcher = ThriftFileWatcher.getInstance();
        this.fileWatcher = fileWatcher.createWatcher('**/*.thrift', () => {
            // Clear all cached symbols when any thrift file changes
            this.cacheManager.clear('workspaceSymbols');
            this.cacheManager.clear('fileSymbols');
        });
    }

    public async provideWorkspaceSymbols(
        query: string,
        token: vscode.CancellationToken
    ): Promise<vscode.SymbolInformation[]> {
        const cacheKey = query || 'all';

        // 先从缓存中获取
        const cached = this.cacheManager.get<vscode.SymbolInformation[]>('workspaceSymbols', cacheKey);
        if (cached) {
            return cached;
        }

        const allSymbols: vscode.SymbolInformation[] = [];

        // 智能文件列表更新 - 只在需要时更新
        const thriftFiles = await this.getThriftFiles();

        for (const file of thriftFiles) {
            if (token.isCancellationRequested) {
                break;
            }

            try {
                const symbols = await this.getSymbolsForFile(file);
                allSymbols.push(...symbols);
            } catch (error) {
                this.errorHandler.handleError(error, {
                    component: 'ThriftWorkspaceSymbolProvider',
                    operation: 'getSymbolsForFile',
                    filePath: file.fsPath,
                    additionalInfo: {query}
                });
            }
        }

        // Filter by query if provided
        let filteredSymbols = allSymbols;
        if (query) {
            filteredSymbols = this.filterSymbols(allSymbols, query);
        }

        // 缓存结果
        this.cacheManager.set('workspaceSymbols', cacheKey, filteredSymbols);

        return filteredSymbols;
    }

    dispose() {
        if (this.fileWatcher) {
            this.fileWatcher.dispose();
        }
        this.cacheManager.clear('workspaceSymbols');
        this.cacheManager.clear('fileSymbols');
    }

    private filterSymbols(symbols: vscode.SymbolInformation[], query: string): vscode.SymbolInformation[] {
        if (!query) {
            return symbols;
        }

        const lowerQuery = query.toLowerCase();
        return symbols.filter(symbol =>
            symbol.name.toLowerCase().includes(lowerQuery) ||
            symbol.containerName.toLowerCase().includes(lowerQuery)
        );
    }

    private async getThriftFiles(): Promise<vscode.Uri[]> {
        const now = Date.now();

        // 只在需要时更新文件列表，避免频繁扫描
        if ((now - this.lastFileListUpdate) > this.FILE_LIST_UPDATE_INTERVAL || this.workspaceFileList.length === 0) {
            console.log(`[WorkspaceSymbolProvider] Updating workspace file list...`);
            const files = await vscode.workspace.findFiles('**/*.thrift', '**/node_modules/**', 1000);
            this.workspaceFileList = files.map(f => f.fsPath);
            this.lastFileListUpdate = now;
            console.log(`[WorkspaceSymbolProvider] Found ${files.length} Thrift files`);
            return files;
        } else {
            // 使用缓存的文件列表
            console.log(`[WorkspaceSymbolProvider] Using cached file list (${this.workspaceFileList.length} files)`);
            return this.workspaceFileList.map(fsPath => vscode.Uri.file(fsPath));
        }
    }

    private async getSymbolsForFile(uri: vscode.Uri): Promise<vscode.SymbolInformation[]> {
        const cacheKey = uri.fsPath;

        // 从缓存管理器获取缓存
        const cached = this.cacheManager.get<vscode.SymbolInformation[]>('fileSymbols', cacheKey);
        if (cached) {
            console.log(`[WorkspaceSymbolProvider] Using cached symbols for: ${path.basename(uri.fsPath)}`);
            return cached;
        }

        console.log(`[WorkspaceSymbolProvider] Parsing symbols for: ${path.basename(uri.fsPath)}`);

        let text = '';
        // Check if buffer is open first
        const openDoc = vscode.workspace.textDocuments.find(d => d.uri.toString() === uri.toString());
        if (openDoc) {
            text = openDoc.getText();
        } else {
            const content = await vscode.workspace.fs.readFile(uri);
            const decoder = new TextDecoder('utf-8');
            text = decoder.decode(content);
        }

        const symbols = this.parseSymbolsFromText(text, uri);

        // 缓存结果
        this.cacheManager.set('fileSymbols', cacheKey, symbols);
        return symbols;
    }

    private parseSymbolsFromText(text: string, uri: vscode.Uri): vscode.SymbolInformation[] {
        const symbols: vscode.SymbolInformation[] = [];
        const lines = text.split('\n');

        let inBlock = false;
        let currentType = '';
        let currentTypeName = '';
        let braceDepth = 0;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();

            // Skip empty lines and comments
            if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) {
                continue;
            }

            // Track brace depth
            if (trimmed.includes('{')) {
                braceDepth++;
                inBlock = true;
            }
            if (trimmed.includes('}')) {
                braceDepth--;
                if (braceDepth === 0) {
                    inBlock = false;
                    currentType = '';
                    currentTypeName = '';
                }
            }

            // Parse type definitions
            const typedefMatch = trimmed.match(/^typedef\s+([A-Za-z_][A-Za-z0-9_]*)\s+([A-Za-z_][A-Za-z0-9_]*)/);
            const typeDefMatch = trimmed.match(/^(struct|union|exception|enum|senum|service)\s+([A-Za-z_][A-Za-z0-9_]*)/);
            const constMatch = trimmed.match(/^const\s+([A-Za-z_][A-Za-z0-9_]*)\s+([A-Za-z_][A-Za-z0-9_]*)/);

            if (typedefMatch) {
                const typedefType = typedefMatch[1];
                const typedefName = typedefMatch[2];
                const symbol = new vscode.SymbolInformation(
                    typedefName,
                    vscode.SymbolKind.TypeParameter,
                    '', // containerName
                    new vscode.Location(uri, new vscode.Range(i, 0, i, line.length))
                );
                symbols.push(symbol);
                continue;
            }

            if (constMatch) {
                const constType = constMatch[1];
                const constName = constMatch[2];
                const symbol = new vscode.SymbolInformation(
                    constName,
                    vscode.SymbolKind.Constant,
                    '', // containerName
                    new vscode.Location(uri, new vscode.Range(i, 0, i, line.length))
                );
                symbols.push(symbol);
                continue;
            }

            if (typeDefMatch) {
                const type = typeDefMatch[1];
                const name = typeDefMatch[2];
                const kind = this.getSymbolKind(type);

                const symbol = new vscode.SymbolInformation(
                    name,
                    kind,
                    '', // containerName
                    new vscode.Location(uri, new vscode.Range(i, 0, i, line.length))
                );

                symbols.push(symbol);

                if (['struct', 'union', 'exception', 'enum', 'senum', 'service'].includes(type)) {
                    currentType = type;
                    currentTypeName = name;
                }
                continue;
            }

            // Parse namespace
            const namespaceMatch = trimmed.match(/^namespace\s+([A-Za-z_][A-Za-z0-9_]*)\s+([A-Za-z_][A-Za-z0-9_]*)/);
            if (namespaceMatch) {
                const language = namespaceMatch[1];
                const namespace = namespaceMatch[2];
                const symbol = new vscode.SymbolInformation(
                    `namespace ${language}`,
                    vscode.SymbolKind.Namespace,
                    '',
                    new vscode.Location(uri, new vscode.Range(i, 0, i, line.length))
                );
                symbols.push(symbol);
                continue;
            }

            // Parse include
            const includeMatch = trimmed.match(/^include\s+["']([^"']+)["']/);
            if (includeMatch) {
                const fileName = includeMatch[1];
                const symbol = new vscode.SymbolInformation(
                    `include ${fileName}`,
                    vscode.SymbolKind.File,
                    '',
                    new vscode.Location(uri, new vscode.Range(i, 0, i, line.length))
                );
                symbols.push(symbol);
                continue;
            }

            // Parse child symbols if we're in a block
            if (inBlock && currentType) {
                const childSymbols = this.parseChildSymbols(line, i, currentType, currentTypeName, uri);
                symbols.push(...childSymbols);
            }
        }

        return symbols;
    }

    private parseChildSymbols(line: string, lineNumber: number, parentType: string, parentName: string, uri: vscode.Uri): vscode.SymbolInformation[] {
        const symbols: vscode.SymbolInformation[] = [];

        if (parentType === 'struct' || parentType === 'union' || parentType === 'exception') {
            // Parse field: 1: required string name,
            const fieldMatch = line.match(/^(\s*)(\d+)\s*:\s*(?:required|optional)?\s*([^\s,]+(?:\s*<[^>]+>\s*)?)\s+([A-Za-z_][A-Za-z0-9_]*)/);
            if (fieldMatch) {
                const fieldId = fieldMatch[2];
                const fieldType = fieldMatch[3];
                const fieldName = fieldMatch[4];

                const symbol = new vscode.SymbolInformation(
                    fieldName,
                    vscode.SymbolKind.Field,
                    parentName,
                    new vscode.Location(uri, new vscode.Range(lineNumber, 0, lineNumber, line.length))
                );

                symbols.push(symbol);
            }
        } else if (parentType === 'enum' || parentType === 'senum') {
            // Parse enum value: VALUE = 1,
            const enumMatch = line.match(/^(\s*)([A-Za-z_][A-Za-z0-9_]*)\s*(?:=\s*([^,;]+))?[,;]?/);
            if (enumMatch && !line.includes('}')) {
                const valueName = enumMatch[2];

                const symbol = new vscode.SymbolInformation(
                    valueName,
                    vscode.SymbolKind.EnumMember,
                    parentName,
                    new vscode.Location(uri, new vscode.Range(lineNumber, 0, lineNumber, line.length))
                );

                symbols.push(symbol);
            }
        } else if (parentType === 'service') {
            // Parse service method: ReturnType methodName(1: ParamType param),
            const methodMatch = line.match(/^(\s*)(oneway\s+)?([A-Za-z_][A-Za-z0-9_]*(?:\s*<[^>]+>\s*)?)\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/);
            if (methodMatch) {
                const methodName = methodMatch[4];

                const symbol = new vscode.SymbolInformation(
                    methodName,
                    vscode.SymbolKind.Method,
                    parentName,
                    new vscode.Location(uri, new vscode.Range(lineNumber, 0, lineNumber, line.length))
                );

                symbols.push(symbol);
            }
        }

        return symbols;
    }

    private getSymbolKind(type: string): vscode.SymbolKind {
        switch (type) {
            case 'struct':
                return vscode.SymbolKind.Struct;
            case 'union':
                return vscode.SymbolKind.Struct;
            case 'exception':
                return vscode.SymbolKind.Class;
            case 'enum':
                return vscode.SymbolKind.Enum;
            case 'senum':
                return vscode.SymbolKind.Enum;
            case 'service':
                return vscode.SymbolKind.Interface;
            case 'typedef':
                return vscode.SymbolKind.TypeParameter;
            case 'const':
                return vscode.SymbolKind.Constant;
            default:
                return vscode.SymbolKind.Variable;
        }
    }
}

export function registerWorkspaceSymbolProvider(context: vscode.ExtensionContext) {
    const provider = new ThriftWorkspaceSymbolProvider();
    const disposable = vscode.languages.registerWorkspaceSymbolProvider(provider);
    context.subscriptions.push(disposable);
    context.subscriptions.push(provider); // for dispose()
}