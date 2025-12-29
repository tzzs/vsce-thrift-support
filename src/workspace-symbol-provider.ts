import * as vscode from 'vscode';
import * as path from 'path';
import {ThriftFileWatcher} from './utils/file-watcher';
import {CacheManager} from './utils/cache-manager';
import {ErrorHandler} from './utils/error-handler';
import {readThriftFile} from './utils/file-reader';
import {ThriftParser} from './ast/parser';
import * as nodes from './ast/nodes.types';
import {config} from './config';

/**
 * ThriftWorkspaceSymbolProvider：提供全局符号搜索。
 */
export class ThriftWorkspaceSymbolProvider implements vscode.WorkspaceSymbolProvider {
    private cacheManager = CacheManager.getInstance();
    private fileWatcher: vscode.FileSystemWatcher | undefined;
    private workspaceFileList: string[] = [];
    private lastFileListUpdate: number = 0;
    private readonly FILE_LIST_UPDATE_INTERVAL = config.workspaceSymbols.fileListUpdateIntervalMs;
    private errorHandler = ErrorHandler.getInstance();
    private readonly component = 'ThriftWorkspaceSymbolProvider';

    constructor() {
        // 注册缓存配置
        this.cacheManager.registerCache('workspaceSymbols', {
            maxSize: config.cache.workspaceSymbols.maxSize,
            ttl: config.cache.workspaceSymbols.ttlMs
        });
        this.cacheManager.registerCache('fileSymbols', {
            maxSize: config.cache.fileSymbols.maxSize,
            ttl: config.cache.fileSymbols.ttlMs
        });

        // Watch for changes to Thrift files
        const fileWatcher = ThriftFileWatcher.getInstance();
        this.fileWatcher = fileWatcher.createWatcher(config.filePatterns.thrift, () => {
            // Clear all cached symbols when any thrift file changes
            this.cacheManager.clear('workspaceSymbols');
            this.cacheManager.clear('fileSymbols');
        });
    }

    /**
     * 返回匹配查询的工作区符号列表。
     */
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

    /**
     * 释放资源并清理缓存。
     */
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
            this.logInfo('updateFileList', 'Updating workspace file list...');
            const files = await vscode.workspace.findFiles(
                config.filePatterns.thrift,
                config.filePatterns.excludeNodeModules,
                config.search.workspaceFileLimit
            );
            this.workspaceFileList = files.map(f => f.fsPath);
            this.lastFileListUpdate = now;
            this.logInfo('updateFileList', `Found ${files.length} Thrift files`);
            return files;
        } else {
            // 使用缓存的文件列表
            this.logInfo('updateFileList', `Using cached file list (${this.workspaceFileList.length} files)`);
            return this.workspaceFileList.map(fsPath => vscode.Uri.file(fsPath));
        }
    }

    private async getSymbolsForFile(uri: vscode.Uri): Promise<vscode.SymbolInformation[]> {
        const cacheKey = uri.fsPath;

        // 从缓存管理器获取缓存
        const cached = this.cacheManager.get<vscode.SymbolInformation[]>('fileSymbols', cacheKey);
        if (cached) {
            this.logInfo('getSymbolsForFile', `Using cached symbols for: ${path.basename(uri.fsPath)}`, uri.fsPath);
            return cached;
        }

        this.logInfo('getSymbolsForFile', `Parsing symbols for: ${path.basename(uri.fsPath)}`, uri.fsPath);

        const text = await readThriftFile(uri);
        const ast = ThriftParser.parseContentWithCache(uri.toString(), text);
        const symbols = this.parseSymbolsFromAst(ast, uri);

        // 缓存结果
        this.cacheManager.set('fileSymbols', cacheKey, symbols);
        return symbols;
    }

    private logInfo(operation: string, message: string, filePath?: string): void {
        this.errorHandler.handleInfo(message, {
            component: this.component,
            operation,
            filePath
        });
    }

    private parseSymbolsFromAst(ast: nodes.ThriftDocument, uri: vscode.Uri): vscode.SymbolInformation[] {
        const symbols: vscode.SymbolInformation[] = [];
        for (const node of ast.body) {
            if (node.type === nodes.ThriftNodeType.Namespace) {
                symbols.push(new vscode.SymbolInformation(
                    `namespace ${node.scope}`,
                    vscode.SymbolKind.Namespace,
                    '',
                    new vscode.Location(uri, node.range)
                ));
                continue;
            }
            if (node.type === nodes.ThriftNodeType.Include) {
                symbols.push(new vscode.SymbolInformation(
                    `include ${node.path}`,
                    vscode.SymbolKind.File,
                    '',
                    new vscode.Location(uri, node.range)
                ));
                continue;
            }
            if (node.type === nodes.ThriftNodeType.Const) {
                symbols.push(new vscode.SymbolInformation(
                    node.name || '',
                    vscode.SymbolKind.Constant,
                    '',
                    new vscode.Location(uri, node.range)
                ));
                continue;
            }
            if (node.type === nodes.ThriftNodeType.Typedef) {
                symbols.push(new vscode.SymbolInformation(
                    node.name || '',
                    vscode.SymbolKind.TypeParameter,
                    '',
                    new vscode.Location(uri, node.range)
                ));
                continue;
            }
            if (node.type === nodes.ThriftNodeType.Struct ||
                node.type === nodes.ThriftNodeType.Union ||
                node.type === nodes.ThriftNodeType.Exception ||
                node.type === nodes.ThriftNodeType.Enum ||
                node.type === nodes.ThriftNodeType.Service) {
                const kind = this.getSymbolKind(node.type);
                symbols.push(new vscode.SymbolInformation(
                    node.name || '',
                    kind,
                    '',
                    new vscode.Location(uri, node.range)
                ));
            }

            if (node.type === nodes.ThriftNodeType.Struct ||
                node.type === nodes.ThriftNodeType.Union ||
                node.type === nodes.ThriftNodeType.Exception) {
                for (const field of node.fields) {
                    symbols.push(new vscode.SymbolInformation(
                        field.name || '',
                        vscode.SymbolKind.Field,
                        node.name || '',
                        new vscode.Location(uri, field.range)
                    ));
                }
            }

            if (node.type === nodes.ThriftNodeType.Enum) {
                for (const member of node.members) {
                    symbols.push(new vscode.SymbolInformation(
                        member.name || '',
                        vscode.SymbolKind.EnumMember,
                        node.name || '',
                        new vscode.Location(uri, member.range)
                    ));
                }
            }

            if (node.type === nodes.ThriftNodeType.Service) {
                for (const fn of node.functions) {
                    symbols.push(new vscode.SymbolInformation(
                        fn.name || '',
                        vscode.SymbolKind.Method,
                        node.name || '',
                        new vscode.Location(uri, fn.range)
                    ));
                }
            }
        }

        return symbols;
    }

    private getSymbolKind(type: nodes.ThriftNodeType): vscode.SymbolKind {
        switch (type) {
            case nodes.ThriftNodeType.Struct:
            case nodes.ThriftNodeType.Union:
                return vscode.SymbolKind.Struct;
            case nodes.ThriftNodeType.Exception:
                return vscode.SymbolKind.Class;
            case nodes.ThriftNodeType.Enum:
                return vscode.SymbolKind.Enum;
            case nodes.ThriftNodeType.Service:
                return vscode.SymbolKind.Interface;
            case nodes.ThriftNodeType.Typedef:
                return vscode.SymbolKind.TypeParameter;
            case nodes.ThriftNodeType.Const:
                return vscode.SymbolKind.Constant;
            default:
                return vscode.SymbolKind.Variable;
        }
    }
}

/**
 * 注册 WorkspaceSymbolProvider。
 */
export function registerWorkspaceSymbolProvider(context: vscode.ExtensionContext) {
    const provider = new ThriftWorkspaceSymbolProvider();
    const disposable = vscode.languages.registerWorkspaceSymbolProvider(provider);
    context.subscriptions.push(disposable);
    context.subscriptions.push(provider); // for dispose()
}
