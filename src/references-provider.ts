import * as vscode from 'vscode';
import {ThriftFileWatcher} from './utils/file-watcher';
import {CacheManager} from './utils/cache-manager';
import {ErrorHandler} from './utils/error-handler';
import {readThriftFile} from './utils/file-reader';
import {config} from './config';
import {CoreDependencies} from './utils/dependencies';
import {AstCache} from './references/ast-cache';
import {ThriftFileList} from './references/file-list';
import {findReferencesInDocument} from './references/reference-search';
import {getSymbolType} from './references/symbol-type';

/**
 * ThriftReferencesProvider：提供引用查找与跨文件扫描。
 */
export class ThriftReferencesProvider implements vscode.ReferenceProvider {
    private isScanning = false;
    private fileList: ThriftFileList;

    // 缓存管理器
    private cacheManager: CacheManager;
    private errorHandler: ErrorHandler;

    // AST缓存，用于存储已解析的AST以避免重复解析
    private astCache: AstCache;

    constructor(deps?: Partial<CoreDependencies>) {
        this.cacheManager = deps?.cacheManager ?? new CacheManager();
        this.errorHandler = deps?.errorHandler ?? new ErrorHandler();
        this.fileList = new ThriftFileList(config.references.fileListUpdateIntervalMs);
        this.astCache = new AstCache(config.references.astCacheTtlMs);

        // 注册缓存配置
        this.cacheManager.registerCache('references', {
            maxSize: config.cache.references.maxSize,
            ttl: config.cache.references.ttlMs
        });
    }

    /**
     * 查找指定符号的所有引用位置。
     */
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
        const symbolType = await getSymbolType(document, position, symbolName, {
            getCachedAst: (doc) => this.astCache.get(doc)
        });

        if (!symbolType) {
            return references;
        }


        // Check for cancellation before proceeding with document processing
        if (token.isCancellationRequested) {
            return [];
        }

        // 创建缓存键
        const cacheKey = `${document.uri.fsPath}:${symbolName}:${symbolType}`;

        // 使用缓存管理器检查缓存
        const cacheName = 'references';
        const cachedReferences = this.cacheManager.get<vscode.Location[]>(cacheName, cacheKey);
        if (cachedReferences) {
            return cachedReferences;
        }

        const includeDeclaration = context?.includeDeclaration;

        // Search in current document
        const currentDocRefs = await findReferencesInDocument(
            document.uri,
            document.getText(),
            symbolName,
            includeDeclaration,
            {errorHandler: this.errorHandler},
            token
        );
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

                const text = await this.errorHandler.wrapAsync(
                    () => readThriftFile(file),
                    {
                        component: 'ThriftReferencesProvider',
                        operation: 'readThriftFile',
                        filePath: file?.fsPath || 'unknown',
                        additionalInfo: {symbolName}
                    },
                    undefined
                );
                if (text === undefined) {
                    continue;
                }

                const refs = await this.errorHandler.wrapAsync(
                    () => findReferencesInDocument(
                        file,
                        text,
                        symbolName,
                        includeDeclaration,
                        {errorHandler: this.errorHandler},
                        token
                    ),
                    {
                        component: 'ThriftReferencesProvider',
                        operation: 'findReferencesInFile',
                        filePath: file?.fsPath || 'unknown',
                        additionalInfo: {symbolName}
                    },
                    []
                );
                references.push(...refs);
            }

            // 缓存结果
            this.cacheManager.set(cacheName, cacheKey, [...references]);

            return references;
        } finally {
            this.isScanning = false;
        }
    }

    /**
     * 清理引用缓存与文件列表缓存。
     */
    public clearCache(): void {
        this.clearReferenceCaches();
        this.fileList.clear();
    }

    public clearReferenceCaches(): void {
        this.cacheManager.clear('references');
        this.astCache.clear();
    }

    public handleFileCreated(uri: vscode.Uri): void {
        this.fileList.handleFileCreated(uri);
        this.clearReferenceCaches();
    }

    public handleFileDeleted(uri: vscode.Uri): void {
        this.fileList.handleFileDeleted(uri);
        this.clearReferenceCaches();
        this.astCache.delete(uri.fsPath);
    }

    /**
     * 获取工作区 Thrift 文件列表（带节流缓存）。
     */
    private async getThriftFiles(): Promise<vscode.Uri[]> {
        return this.fileList.getFiles();
    }
}

/**
 * 注册 ReferencesProvider 与缓存清理。
 */
export function registerReferencesProvider(context: vscode.ExtensionContext, deps?: Partial<CoreDependencies>) {
    const provider = new ThriftReferencesProvider(deps);
    const disposable = vscode.languages.registerReferenceProvider('thrift', provider);
    context.subscriptions.push(disposable);

    // 添加文件监听器，当文件改变时清除缓存
    const fileWatcher = deps?.fileWatcher ?? new ThriftFileWatcher();
    const referencesFileWatcher = fileWatcher.createWatcherWithEvents(config.filePatterns.thrift, {
        onCreate: (uri) => provider.handleFileCreated(uri),
        onDelete: (uri) => provider.handleFileDeleted(uri),
        onChange: () => provider.clearReferenceCaches()
    });
    context.subscriptions.push(referencesFileWatcher);
}
