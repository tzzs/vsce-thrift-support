import * as vscode from 'vscode';
import {ThriftParser} from '@tanzz/thrift-core';
import {nodes} from '@tanzz/thrift-core';
import {ThriftFileWatcher} from './utils/file-watcher';
import {CacheManager} from '@tanzz/thrift-core';
import {config} from '@tanzz/thrift-core';
import {ErrorHandler} from '@tanzz/thrift-core';
import {CoreDependencies} from './utils/dependencies';
import {toVscodeRange} from './utils/vscode-utils';
import {nodeTypeToSymbolKind} from './utils/symbol-utils';

/**
 * ThriftDocumentSymbolProvider：提供文档符号与 Outline 支持。
 */
export class ThriftDocumentSymbolProvider implements vscode.DocumentSymbolProvider {
    private cacheManager: CacheManager;
    private errorHandler: ErrorHandler;
    private fileWatcher: ThriftFileWatcher;

    constructor(deps?: Partial<CoreDependencies>) {
        this.cacheManager = deps?.cacheManager ?? new CacheManager();
        this.errorHandler = deps?.errorHandler ?? new ErrorHandler();
        this.fileWatcher = deps?.fileWatcher ?? new ThriftFileWatcher();

        // 注册缓存配置
        this.cacheManager.registerCache('documentSymbols', {
            maxSize: config.cache.documentSymbols.maxSize,
            ttl: config.cache.documentSymbols.ttlMs
        });

        // 监听文件变化，清除缓存
        this.fileWatcher.createWatcher(config.filePatterns.thrift, () => {
            this.cacheManager.clear('documentSymbols');
        });
    }

    /**
     * 清理符号缓存（可按 URI）。
     */
    public clearCache(uri?: vscode.Uri): void {
        if (uri) {
            this.cacheManager.delete('documentSymbols', uri.toString());
        } else {
            this.cacheManager.clear('documentSymbols');
        }
    }

    /**
     * 返回文档符号列表。
     */
    public provideDocumentSymbols(
        document: vscode.TextDocument,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.SymbolInformation[] | vscode.DocumentSymbol[]> {
        try {
            void token;
            const key = document.uri.toString();

            // 从缓存管理器获取缓存
            const cached = this.cacheManager.get<vscode.DocumentSymbol[]>('documentSymbols', key);
            if (cached) {
                return cached;
            }

            // 缓存无效，重新解析
            const parser = new ThriftParser(document.getText());
            const thriftDoc = parser.parse();
            const symbols: vscode.DocumentSymbol[] = [];

            for (const node of thriftDoc.body) {
                const sym = this.createSymbol(node);
                if (sym) {
                    symbols.push(sym);
                }
            }

            // 更新缓存
            this.cacheManager.set('documentSymbols', key, symbols);

            return symbols;
        } catch (error) {
            this.errorHandler.handleError(error, {
                component: 'ThriftDocumentSymbolProvider',
                operation: 'provideDocumentSymbols',
                filePath: document.uri.fsPath
            });
            return [];
        }
    }

    private createSymbol(node: nodes.ThriftNode): vscode.DocumentSymbol | null {
        let name = node.name ?? 'Script';
        let detail = '';
        // Derive kind from the shared mapping; cases below handle only detail/name.
        const kind = nodeTypeToSymbolKind(node.type);

        const range = node.range;
        const selectionRange = node.range;

        switch (node.type) {
            case nodes.ThriftNodeType.Namespace: {
                name = `namespace ${node.scope}`;
                detail = `${name} ${node.namespace}`;
                break;
            }
            case nodes.ThriftNodeType.Include: {
                name = `include ${name}`;
                detail = `include ${name}`;
                break;
            }
            case nodes.ThriftNodeType.Const: {
                detail = `const ${node.valueType} ${name}`;
                break;
            }
            case nodes.ThriftNodeType.Typedef: {
                detail = `typedef ${node.aliasType} ${name}`;
                break;
            }
            case nodes.ThriftNodeType.Struct: {
                detail = `struct ${name}`;
                break;
            }
            case nodes.ThriftNodeType.Union: {
                detail = `union ${name}`;
                break;
            }
            case nodes.ThriftNodeType.Exception: {
                detail = `exception ${name}`;
                break;
            }
            case nodes.ThriftNodeType.Enum: {
                detail = `enum ${name}`;
                break;
            }
            case nodes.ThriftNodeType.Service: {
                detail = `service ${name}${node.extends !== undefined ? ` extends ${node.extends}` : ''}`;
                break;
            }
            case nodes.ThriftNodeType.Interaction: {
                detail = `interaction ${name}`;
                break;
            }
            case nodes.ThriftNodeType.EnumMember: {
                detail = name;
                if (node.initializer !== undefined) {
                    detail += ` = ${node.initializer}`;
                }
                break;
            }
            case nodes.ThriftNodeType.Field: {
                detail = `${node.id}: ${node.requiredness ? node.requiredness + ' ' : ''}${node.fieldType} ${name}`;
                break;
            }
            case nodes.ThriftNodeType.Function: {
                detail = `${node.oneway ? 'oneway ' : ''}${node.returnType} ${name}`;
                break;
            }
            default:
                return null;
        }

        const docSymbol = new vscode.DocumentSymbol(
            name,
            detail,
            kind,
            toVscodeRange(range),
            toVscodeRange(selectionRange)
        );

        // Process children
        if (node.type === nodes.ThriftNodeType.Struct ||
            node.type === nodes.ThriftNodeType.Union ||
            node.type === nodes.ThriftNodeType.Exception) {
            const structNode = node;
            for (const field of structNode.fields) {
                const childSym = this.createSymbol(field);
                if (childSym) {
                    docSymbol.children.push(childSym);
                }
            }
        } else if (node.type === nodes.ThriftNodeType.Enum) {
            const enumNode = node;
            for (const member of enumNode.members) {
                const childSym = this.createSymbol(member);
                if (childSym) {
                    docSymbol.children.push(childSym);
                }
            }
        } else if (node.type === nodes.ThriftNodeType.Service) {
            const serviceNode = node;
            for (const func of serviceNode.functions) {
                const childSym = this.createSymbol(func);
                if (childSym) {
                    docSymbol.children.push(childSym);
                }
            }
        } else if (node.type === nodes.ThriftNodeType.Interaction) {
            const interactionNode = node;
            for (const func of interactionNode.functions) {
                const childSym = this.createSymbol(func);
                if (childSym) {
                    docSymbol.children.push(childSym);
                }
            }
        }

        return docSymbol;
    }
}

/**
 * 注册 Thrift 文档符号提供者
 * @param context vscode 扩展上下文
 */
/**
 * 注册 DocumentSymbolProvider 与缓存清理逻辑。
 */
export function registerDocumentSymbolProvider(context: vscode.ExtensionContext, deps?: Partial<CoreDependencies>) {
    const provider = new ThriftDocumentSymbolProvider(deps);
    const disposable = vscode.languages.registerDocumentSymbolProvider('thrift', provider);
    context.subscriptions.push(disposable);

    // Clear cache on in-memory edits to avoid stale symbols for dirty docs.
    const changeDisposable = vscode.workspace.onDidChangeTextDocument((event) => {
        if (event.document.languageId !== 'thrift') {
            return;
        }
        provider.clearCache(event.document.uri);
    });
    context.subscriptions.push(changeDisposable);

    // 添加文件监听器，当文件改变时清除缓存
    const fileWatcher = deps?.fileWatcher ?? new ThriftFileWatcher();
    const docSymbolFileWatcher = fileWatcher.createWatcher(config.filePatterns.thrift, () => {
        // 清除所有缓存，因为文件变化可能影响符号解析
        provider.clearCache();
    });
    context.subscriptions.push(docSymbolFileWatcher);
}
