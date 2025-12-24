import * as vscode from 'vscode';
import {ThriftParser} from './ast/parser';
import * as nodes from './ast/nodes';
import {ThriftFileWatcher} from '../utils/fileWatcher';
import {CacheManager} from '../utils/cacheManager';
import {ErrorHandler} from '../utils/errorHandler';

export class ThriftDocumentSymbolProvider implements vscode.DocumentSymbolProvider {
    private cacheManager = CacheManager.getInstance();
    private errorHandler = ErrorHandler.getInstance();

    constructor() {
        // 注册缓存配置
        this.cacheManager.registerCache('documentSymbols', {
            maxSize: 500,
            ttl: 10000 // 10秒
        });

        // 监听文件变化，清除缓存
        const fileWatcher = ThriftFileWatcher.getInstance();
        fileWatcher.createWatcher('**/*.thrift', () => {
            this.cacheManager.clear('documentSymbols');
        });
    }

    // 清除缓存
    public clearCache(uri?: vscode.Uri): void {
        if (uri) {
            this.cacheManager.delete('documentSymbols', uri.toString());
        } else {
            this.cacheManager.clear('documentSymbols');
        }
    }

    public provideDocumentSymbols(
        document: vscode.TextDocument,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.SymbolInformation[] | vscode.DocumentSymbol[]> {
        const key = document.uri.toString();

        // 从缓存管理器获取缓存
        const cached = this.cacheManager.get<vscode.DocumentSymbol[]>('documentSymbols', key);
        if (cached) {
            return cached;
        }

        // 缓存无效，重新解析
        const parser = new ThriftParser(document);
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
    }

    private createSymbol(node: nodes.ThriftNode): vscode.DocumentSymbol | null {
        let name = node.name || 'Script';
        let detail = '';
        let kind = vscode.SymbolKind.File;
        // The parser provides ranges for the whole node (including body).
        // Selection range should ideally be just the name, but for now we can use the whole range or a sub-range if available.
        // We will default selection range to the start of the node range if name range isn't explicitly tracked separate from node range.
        // Improvements can be made in the parser to track name specific range.
        // For this refactor, we try to estimate selection range or just use the node range.

        // Refined logical ranges
        const range = node.range;
        const selectionRange = node.range; // Ideally this points to just the identifier

        switch (node.type) {
            case nodes.ThriftNodeType.Namespace:
                kind = vscode.SymbolKind.Namespace;
                name = `namespace ${(node as nodes.Namespace).scope}`;
                detail = `${name} ${(node as nodes.Namespace).namespace}`;
                console.log(`DEBUG: Namespace node - scope: ${(node as nodes.Namespace).scope}, namespace: ${(node as nodes.Namespace).namespace}, name: ${name}, detail: ${detail}`);
                break;
            case nodes.ThriftNodeType.Include:
                kind = vscode.SymbolKind.File;
                name = `include ${name}`;
                detail = `include ${name}`;
                break;
            case nodes.ThriftNodeType.Const:
                kind = vscode.SymbolKind.Constant;
                const constNode = node as nodes.Const;
                detail = `const ${constNode.valueType} ${name}`;
                break;
            case nodes.ThriftNodeType.Typedef:
                kind = vscode.SymbolKind.TypeParameter; // VSCode doesn't have Typedef kind, TypeParameter or Interface is close
                const typedefNode = node as nodes.Typedef;
                detail = `typedef ${typedefNode.aliasType} ${name}`;
                break;
            case nodes.ThriftNodeType.Struct:
                kind = vscode.SymbolKind.Struct;
                detail = `struct ${name}`;
                break;
            case nodes.ThriftNodeType.Union:
                kind = vscode.SymbolKind.Struct;
                detail = `union ${name}`;
                break;
            case nodes.ThriftNodeType.Exception:
                kind = vscode.SymbolKind.Class; // Exception is close to Class
                detail = `exception ${name}`;
                break;
            case nodes.ThriftNodeType.Enum:
                kind = vscode.SymbolKind.Enum;
                detail = `enum ${name}`;
                break;
            case nodes.ThriftNodeType.Service:
                kind = vscode.SymbolKind.Interface;
                const serviceNode = node as nodes.Service;
                detail = `service ${name}${serviceNode.extends ? ' extends ' + serviceNode.extends : ''}`;
                break;
            case nodes.ThriftNodeType.EnumMember:
                kind = vscode.SymbolKind.EnumMember;
                const enumMember = node as nodes.EnumMember;
                detail = name;
                if (enumMember.initializer) {
                    detail += ` = ${enumMember.initializer}`;
                }
                break;
            case nodes.ThriftNodeType.Field:
                kind = vscode.SymbolKind.Field;
                const fieldNode = node as nodes.Field;
                detail = `${fieldNode.id}: ${fieldNode.requiredness ? fieldNode.requiredness + ' ' : ''}${fieldNode.fieldType} ${name}`;
                break;
            case nodes.ThriftNodeType.Function:
                kind = vscode.SymbolKind.Method;
                const funcNode = node as nodes.ThriftFunction;
                detail = `${funcNode.oneway ? 'oneway ' : ''}${funcNode.returnType} ${name}`;
                break;
            default:
                return null;
        }

        const docSymbol = new vscode.DocumentSymbol(
            name,
            detail,
            kind,
            range,
            selectionRange
        );

        // Process children
        if (node.type === nodes.ThriftNodeType.Struct ||
            node.type === nodes.ThriftNodeType.Union ||
            node.type === nodes.ThriftNodeType.Exception) {
            const structNode = node as nodes.Struct;
            for (const field of structNode.fields) {
                const childSym = this.createSymbol(field);
                if (childSym) {
                    docSymbol.children.push(childSym);
                }
            }
        } else if (node.type === nodes.ThriftNodeType.Enum) {
            const enumNode = node as nodes.Enum;
            for (const member of enumNode.members) {
                const childSym = this.createSymbol(member);
                if (childSym) {
                    docSymbol.children.push(childSym);
                }
            }
        } else if (node.type === nodes.ThriftNodeType.Service) {
            const serviceNode = node as nodes.Service;
            for (const func of serviceNode.functions) {
                const childSym = this.createSymbol(func);
                if (childSym) {
                    docSymbol.children.push(childSym);
                }
            }
        }

        return docSymbol;
    }
}

export function registerDocumentSymbolProvider(context: vscode.ExtensionContext) {
    const provider = new ThriftDocumentSymbolProvider();
    const disposable = vscode.languages.registerDocumentSymbolProvider('thrift', provider);
    context.subscriptions.push(disposable);

    // 添加文件监听器，当文件改变时清除缓存
    const fileWatcher = ThriftFileWatcher.getInstance();
    const docSymbolFileWatcher = fileWatcher.createWatcher('**/*.thrift', () => {
        // 清除所有缓存，因为文件变化可能影响符号解析
        provider.clearCache();
    });
    context.subscriptions.push(docSymbolFileWatcher);
}