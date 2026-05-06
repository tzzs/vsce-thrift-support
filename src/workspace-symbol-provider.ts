import * as vscode from 'vscode';
import * as path from 'path';
import {ThriftFileWatcher} from './utils/file-watcher';
import {CacheManager} from './utils/cache-manager';
import {ErrorHandler} from './utils/error-handler';
import {readThriftFile} from './utils/file-reader';
import {ThriftParser} from './ast/parser';
import * as nodes from './ast/nodes.types';
import {config} from './config';
import {CoreDependencies} from './utils/dependencies';
import {createLocation} from './utils/vscode-utils';

/**
 * ThriftWorkspaceSymbolProvider：提供全局符号搜索。
 */
export class ThriftWorkspaceSymbolProvider {
    private cacheManager: CacheManager;
    private fileWatcher: vscode.FileSystemWatcher | undefined;
    private workspaceFileList: Set<string> = new Set();
    private lastFileListUpdate = 0;
    private readonly FILE_LIST_UPDATE_INTERVAL = config.workspaceSymbols.fileListUpdateIntervalMs;
    private errorHandler: ErrorHandler;
    private readonly component = 'ThriftWorkspaceSymbolProvider';

    constructor(deps?: Partial<CoreDependencies>) {
        this.cacheManager = deps?.cacheManager ?? new CacheManager();
        this.errorHandler = deps?.errorHandler ?? new ErrorHandler();

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
        const fileWatcher = deps?.fileWatcher ?? new ThriftFileWatcher();
        this.fileWatcher = fileWatcher.createWatcherWithEvents(config.filePatterns.thrift, {
            onCreate: (uri) => this.handleFileCreated(uri),
            onDelete: (uri) => this.handleFileDeleted(uri),
            onChange: () => {
                // Clear all cached symbols when any thrift file changes
                this.cacheManager.clear('workspaceSymbols');
                this.cacheManager.clear('fileSymbols');
            }
        });
    }

    /**
     * 返回匹配查询的工作区符号列表。
     */
    public provideWorkspaceSymbols(
        query: string,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.SymbolInformation[]> {
        const cacheKey = query || 'all';

        // 先从缓存中获取
        const cached = this.cacheManager.get<vscode.SymbolInformation[]>(
            'workspaceSymbols',
            cacheKey
        );
        if (cached) {
            return cached;
        }

        // 实际实现需要查找工作区内的所有符号
        return this.doProvideWorkspaceSymbols(query, token);
    }

    private async doProvideWorkspaceSymbols(
        query: string,
        token: vscode.CancellationToken
    ): Promise<vscode.SymbolInformation[]> {
        if (token.isCancellationRequested) {
            return [];
        }

        try {
            const thriftFiles = await this.getThriftFiles();

            // 收集所有符号
            const allSymbols: vscode.SymbolInformation[] = [];
            for (const uri of thriftFiles) {
                if (token.isCancellationRequested) {
                    break;
                }

                const fileSymbols = await this.getSymbolsForFile(uri);
                const filteredSymbols = this.filterSymbols(fileSymbols, query);
                allSymbols.push(...filteredSymbols);
            }

            // 缓存结果（如果查询为空，表示获取所有符号）
            if (!query) {
                this.cacheManager.set('workspaceSymbols', 'all', allSymbols);
            }

            return allSymbols;
        } catch (error) {
            this.errorHandler.handleError(error, {
                component: this.component,
                operation: 'doProvideWorkspaceSymbols'
            });
            return [];
        }
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

    private filterSymbols(
        symbols: vscode.SymbolInformation[],
        query: string
    ): vscode.SymbolInformation[] {
        if (!query) {
            return symbols;
        }

        const lowerQuery = query.toLowerCase();
        return symbols.filter(
            (symbol) =>
                symbol.name.toLowerCase().includes(lowerQuery) ||
                symbol.containerName.toLowerCase().includes(lowerQuery)
        );
    }

    private async getThriftFiles(): Promise<vscode.Uri[]> {
        const now = Date.now();

        // 只在需要时更新文件列表，避免频繁扫描
        if (
            now - this.lastFileListUpdate > this.FILE_LIST_UPDATE_INTERVAL ||
            this.workspaceFileList.size === 0
        ) {
            this.logInfo('updateFileList', 'Updating workspace file list...');
            const files = await vscode.workspace.findFiles(
                config.filePatterns.thrift,
                config.filePatterns.excludeNodeModules,
                config.search.workspaceFileLimit
            );
            this.workspaceFileList = new Set(files.map((f) => f.toString()));
            this.lastFileListUpdate = now;
            this.logInfo('updateFileList', `Found ${files.length} Thrift files`);
            return files;
        } else {
            // 使用缓存的文件列表
            this.logInfo(
                'updateFileList',
                `Using cached file list (${this.workspaceFileList.size} files)`
            );
            return Array.from(this.workspaceFileList, (uri) => vscode.Uri.parse(uri));
        }
    }

    private async getSymbolsForFile(uri: vscode.Uri): Promise<vscode.SymbolInformation[]> {
        const cacheKey = uri.toString();
        const displayPath = uri.fsPath || uri.path || uri.toString();

        // 从缓存管理器获取缓存
        const cached = this.cacheManager.get<vscode.SymbolInformation[]>('fileSymbols', cacheKey);
        if (cached) {
            this.logInfo(
                'getSymbolsForFile',
                `Using cached symbols for: ${path.basename(displayPath)}`,
                displayPath
            );
            return cached;
        }

        this.logInfo(
            'getSymbolsForFile',
            `Parsing symbols for: ${path.basename(displayPath)}`,
            displayPath
        );

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

    private handleFileCreated(uri: vscode.Uri): void {
        if (!uri) {
            return;
        }
        this.workspaceFileList.add(uri.toString());
        this.lastFileListUpdate = Date.now();
        this.cacheManager.clear('workspaceSymbols');
    }

    private handleFileDeleted(uri: vscode.Uri): void {
        if (!uri) {
            return;
        }
        const cacheKey = uri.toString();
        this.workspaceFileList.delete(cacheKey);
        this.lastFileListUpdate = Date.now();
        this.cacheManager.clear('workspaceSymbols');
        this.cacheManager.delete('fileSymbols', cacheKey);
    }

    private parseSymbolsFromAst(
        ast: nodes.ThriftDocument,
        uri: vscode.Uri
    ): vscode.SymbolInformation[] {
        const symbols: vscode.SymbolInformation[] = [];
        for (const node of ast.body) {
            if (node.type === nodes.ThriftNodeType.Namespace) {
                symbols.push(
                    new vscode.SymbolInformation(
                        `namespace ${node.scope}`,
                        vscode.SymbolKind.Namespace,
                        '',
                        createLocation(uri, node.range)
                    )
                );
                continue;
            }
            if (node.type === nodes.ThriftNodeType.Include) {
                symbols.push(
                    new vscode.SymbolInformation(
                        `include ${node.path}`,
                        vscode.SymbolKind.File,
                        '',
                        createLocation(uri, node.range)
                    )
                );
                continue;
            }
            if (node.type === nodes.ThriftNodeType.Const) {
                symbols.push(
                    new vscode.SymbolInformation(
                        node.name || '',
                        vscode.SymbolKind.Constant,
                        '',
                        createLocation(uri, node.range)
                    )
                );
                continue;
            }
            if (node.type === nodes.ThriftNodeType.Typedef) {
                symbols.push(
                    new vscode.SymbolInformation(
                        node.name || '',
                        vscode.SymbolKind.TypeParameter,
                        '',
                        createLocation(uri, node.range)
                    )
                );
                continue;
            }
            if (
                node.type === nodes.ThriftNodeType.Struct ||
                node.type === nodes.ThriftNodeType.Union ||
                node.type === nodes.ThriftNodeType.Exception ||
                node.type === nodes.ThriftNodeType.Enum ||
                node.type === nodes.ThriftNodeType.Service
            ) {
                const kind = this.getSymbolKind(node.type);
                symbols.push(
                    new vscode.SymbolInformation(
                        node.name || '',
                        kind,
                        '',
                        createLocation(uri, node.range)
                    )
                );
            }

            if (
                node.type === nodes.ThriftNodeType.Struct ||
                node.type === nodes.ThriftNodeType.Union ||
                node.type === nodes.ThriftNodeType.Exception
            ) {
                for (const field of node.fields) {
                    symbols.push(
                        new vscode.SymbolInformation(
                            field.name || '',
                            vscode.SymbolKind.Field,
                            node.name || '',
                            createLocation(uri, field.range)
                        )
                    );
                }
            }

            if (node.type === nodes.ThriftNodeType.Enum) {
                for (const member of node.members) {
                    symbols.push(
                        new vscode.SymbolInformation(
                            member.name || '',
                            vscode.SymbolKind.EnumMember,
                            node.name || '',
                            createLocation(uri, member.range)
                        )
                    );
                }
            }

            if (node.type === nodes.ThriftNodeType.Service) {
                for (const fn of node.functions) {
                    symbols.push(
                        new vscode.SymbolInformation(
                            fn.name || '',
                            vscode.SymbolKind.Method,
                            node.name || '',
                            createLocation(uri, fn.range)
                        )
                    );
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
export function registerWorkspaceSymbolProvider(
    context: vscode.ExtensionContext,
    deps?: Partial<CoreDependencies>
) {
    const provider = new ThriftWorkspaceSymbolProvider(deps);
    const disposable = vscode.languages.registerWorkspaceSymbolProvider(provider as vscode.WorkspaceSymbolProvider);
    context.subscriptions.push(disposable);
    context.subscriptions.push(provider); // for dispose()
}
