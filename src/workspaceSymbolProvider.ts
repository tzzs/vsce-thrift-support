import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export class ThriftWorkspaceSymbolProvider implements vscode.WorkspaceSymbolProvider {
    private cachedSymbols: Map<string, vscode.SymbolInformation[]> = new Map();
    private fileWatcher: vscode.FileSystemWatcher | undefined;
    private lastGlobalScan: number = 0;
    private readonly GLOBAL_SCAN_INTERVAL = 60000; // 60秒间隔，增加间隔时间
    private isScanning: boolean = false;
    private workspaceFileList: string[] = [];
    private lastFileListUpdate: number = 0;
    private readonly FILE_LIST_UPDATE_INTERVAL = 30000; // 30秒更新文件列表

    constructor() {
        // Watch for changes to Thrift files
        this.fileWatcher = vscode.workspace.createFileSystemWatcher('**/*.thrift');

        if (this.fileWatcher && this.fileWatcher.onDidCreate) {
            this.fileWatcher.onDidCreate((uri: vscode.Uri) => {
                this.cachedSymbols.delete(uri.fsPath);
            });

            this.fileWatcher.onDidChange((uri: vscode.Uri) => {
                this.cachedSymbols.delete(uri.fsPath);
            });

            this.fileWatcher.onDidDelete((uri: vscode.Uri) => {
                this.cachedSymbols.delete(uri.fsPath);
            });
        }
    }

    public async provideWorkspaceSymbols(
        query: string,
        token: vscode.CancellationToken
    ): Promise<vscode.SymbolInformation[]> {
        const allSymbols: vscode.SymbolInformation[] = [];

        // 限制全局扫描频率，避免频繁触发
        const now = Date.now();
        if (this.isScanning || (now - this.lastGlobalScan) < this.GLOBAL_SCAN_INTERVAL) {
            // 使用缓存数据
            for (const [uri, symbols] of this.cachedSymbols) {
                if (token.isCancellationRequested) break;
                allSymbols.push(...symbols);
            }
            return this.filterSymbols(allSymbols, query);
        }

        this.isScanning = true;
        this.lastGlobalScan = now;

        try {
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
                    console.error(`Error parsing symbols from ${file.fsPath}:`, error);
                }
            }
        } finally {
            this.isScanning = false;
        }

        // Filter by query if provided
        if (query) {
            const lowerQuery = query.toLowerCase();
            return allSymbols.filter(symbol =>
                symbol.name.toLowerCase().includes(lowerQuery) ||
                symbol.containerName.toLowerCase().includes(lowerQuery)
            );
        }

        return allSymbols;
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
        // Check cache first
        if (this.cachedSymbols.has(uri.fsPath)) {
            console.log(`[WorkspaceSymbolProvider] Using cached symbols for: ${path.basename(uri.fsPath)}`);
            return this.cachedSymbols.get(uri.fsPath)!;
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

        // Cache the results
        this.cachedSymbols.set(uri.fsPath, symbols);
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
            case 'struct': return vscode.SymbolKind.Struct;
            case 'union': return vscode.SymbolKind.Struct;
            case 'exception': return vscode.SymbolKind.Class;
            case 'enum': return vscode.SymbolKind.Enum;
            case 'senum': return vscode.SymbolKind.Enum;
            case 'service': return vscode.SymbolKind.Interface;
            case 'typedef': return vscode.SymbolKind.TypeParameter;
            case 'const': return vscode.SymbolKind.Constant;
            default: return vscode.SymbolKind.Variable;
        }
    }

    dispose() {
        if (this.fileWatcher) {
            this.fileWatcher.dispose();
        }
        this.cachedSymbols.clear();
    }
}

export function registerWorkspaceSymbolProvider(context: vscode.ExtensionContext) {
    const provider = new ThriftWorkspaceSymbolProvider();
    const disposable = vscode.languages.registerWorkspaceSymbolProvider(provider);
    context.subscriptions.push(disposable);
    context.subscriptions.push(provider); // for dispose()
}