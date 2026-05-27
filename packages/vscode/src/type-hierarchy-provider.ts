import * as vscode from 'vscode';
import {ThriftParser, nodes, ErrorHandler, config} from '@tanzz/thrift-core';
import {CoreDependencies} from './utils/dependencies';
import {toVscodeRange} from './utils/vscode-utils';

interface DocPair {
    uri: vscode.Uri;
    ast: nodes.ThriftDocument;
}

interface TypeEntry {
    name: string;
    node: nodes.ThriftNode;
    uri: vscode.Uri;
    kind: vscode.SymbolKind;
    detail: string;
    /** Parent type name (for service extends or typedef alias). */
    parentName?: string;
}

export function buildTypeHierarchyIndex(docs: DocPair[]): Map<string, TypeEntry> {
    const index = new Map<string, TypeEntry>();
    for (const {uri, ast} of docs) {
        for (const node of ast.body) {
            const name = node.name;
            if (name === undefined || name === '') {
                continue;
            }
            switch (node.type) {
                case nodes.ThriftNodeType.Struct:
                    index.set(name, {
                        name, node, uri,
                        kind: vscode.SymbolKind.Struct,
                        detail: `struct ${name}`
                    });
                    break;
                case nodes.ThriftNodeType.Union:
                    index.set(name, {
                        name, node, uri,
                        kind: vscode.SymbolKind.Struct,
                        detail: `union ${name}`
                    });
                    break;
                case nodes.ThriftNodeType.Exception:
                    index.set(name, {
                        name, node, uri,
                        kind: vscode.SymbolKind.Class,
                        detail: `exception ${name}`
                    });
                    break;
                case nodes.ThriftNodeType.Enum:
                    index.set(name, {
                        name, node, uri,
                        kind: vscode.SymbolKind.Enum,
                        detail: `enum ${name}`
                    });
                    break;
                case nodes.ThriftNodeType.Service:
                    index.set(name, {
                        name, node, uri,
                        kind: vscode.SymbolKind.Interface,
                        detail: `service ${name}`,
                        parentName: node.extends
                    });
                    break;
                case nodes.ThriftNodeType.Interaction:
                    index.set(name, {
                        name, node, uri,
                        kind: vscode.SymbolKind.Interface,
                        detail: `interaction ${name}`
                    });
                    break;
                case nodes.ThriftNodeType.Typedef:
                    index.set(name, {
                        name, node, uri,
                        kind: vscode.SymbolKind.TypeParameter,
                        detail: `typedef ${node.aliasType} ${name}`,
                        parentName: extractBaseTypeName(node.aliasType)
                    });
                    break;
                default:
                    break;
            }
        }
    }
    return index;
}

function extractBaseTypeName(typeText: string): string | undefined {
    if (!typeText) {
        return undefined;
    }
    const trimmed = typeText.trim();
    // For container types, no single base name to attribute as supertype.
    if (/^(list|set|map|stream|sink)\s*</.test(trimmed)) {
        return undefined;
    }
    const lastDot = trimmed.lastIndexOf('.');
    return lastDot >= 0 ? trimmed.slice(lastDot + 1) : trimmed;
}

export function findTypeAtPosition(
    ast: nodes.ThriftDocument,
    line: number,
    character: number
): nodes.ThriftNode | null {
    // Pass 1: prefer nameRange hits (precise identifier click)
    for (const node of ast.body) {
        if (!node.nameRange) {
            continue;
        }
        const r = node.nameRange;
        if (positionInRange(line, character, r.start.line, r.start.character, r.end.line, r.end.character)) {
            return node;
        }
    }
    // Pass 2: pick the narrowest enclosing top-level type whose body range covers the position.
    // Top-level ranges from the parser may overlap, so we measure span size and keep the smallest.
    let best: nodes.ThriftNode | null = null;
    let bestSpan = Infinity;
    for (const node of ast.body) {
        if (!isHierarchicalType(node)) {
            continue;
        }
        const fr = node.range;
        if (!positionInRange(line, character, fr.start.line, fr.start.character, fr.end.line, fr.end.character)) {
            continue;
        }
        const span = (fr.end.line - fr.start.line) * 1000 + (fr.end.character - fr.start.character);
        if (span < bestSpan) {
            bestSpan = span;
            best = node;
        }
    }
    return best;
}

function isHierarchicalType(node: nodes.ThriftNode): boolean {
    return (
        node.type === nodes.ThriftNodeType.Struct ||
        node.type === nodes.ThriftNodeType.Union ||
        node.type === nodes.ThriftNodeType.Exception ||
        node.type === nodes.ThriftNodeType.Enum ||
        node.type === nodes.ThriftNodeType.Service ||
        node.type === nodes.ThriftNodeType.Interaction ||
        node.type === nodes.ThriftNodeType.Typedef
    );
}

function positionInRange(
    line: number,
    character: number,
    sLine: number,
    sChar: number,
    eLine: number,
    eChar: number
): boolean {
    if (line < sLine || line > eLine) {
        return false;
    }
    if (line === sLine && character < sChar) {
        return false;
    }
    if (line === eLine && character > eChar) {
        return false;
    }
    return true;
}

/**
 * AST-driven Type Hierarchy for Thrift IDL.
 *
 * Supports:
 * - service extends parent service (full extends chain)
 * - typedef → base type (one hop)
 * - struct / union / enum / exception / interaction: degenerate (no native extends)
 */
export class ThriftTypeHierarchyProvider implements vscode.TypeHierarchyProvider {
    private readonly errorHandler: ErrorHandler;
    private readonly decoder = new TextDecoder('utf-8');

    constructor(deps?: Partial<CoreDependencies>) {
        this.errorHandler = deps?.errorHandler ?? new ErrorHandler();
    }

    public prepareTypeHierarchy(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): vscode.TypeHierarchyItem | vscode.TypeHierarchyItem[] | undefined {
        if (token.isCancellationRequested) {
            return undefined;
        }
        try {
            const ast = this.parseDocument(document);
            if (!ast) {
                return undefined;
            }
            const node = findTypeAtPosition(ast, position.line, position.character);
            if (!node || node.name === undefined || node.name === '') {
                return undefined;
            }
            return entryToItem(nodeToEntry(node, document.uri));
        } catch (error) {
            this.errorHandler.handleError(error, {
                component: 'ThriftTypeHierarchyProvider',
                operation: 'prepareTypeHierarchy',
                filePath: document.uri.fsPath
            });
            return undefined;
        }
    }

    public async provideTypeHierarchySupertypes(
        item: vscode.TypeHierarchyItem,
        token: vscode.CancellationToken
    ): Promise<vscode.TypeHierarchyItem[]> {
        if (token.isCancellationRequested) {
            return [];
        }
        try {
            const docs = await this.getWorkspaceDocuments();
            const index = buildTypeHierarchyIndex(docs);
            const entry = index.get(item.name);
            if (entry === undefined || entry.parentName === undefined || entry.parentName === '') {
                return [];
            }
            const parent = index.get(entry.parentName);
            if (!parent) {
                return [];
            }
            return [entryToItem(parent)];
        } catch (error) {
            this.errorHandler.handleError(error, {
                component: 'ThriftTypeHierarchyProvider',
                operation: 'provideSupertypes'
            });
            return [];
        }
    }

    public async provideTypeHierarchySubtypes(
        item: vscode.TypeHierarchyItem,
        token: vscode.CancellationToken
    ): Promise<vscode.TypeHierarchyItem[]> {
        if (token.isCancellationRequested) {
            return [];
        }
        try {
            const docs = await this.getWorkspaceDocuments();
            const index = buildTypeHierarchyIndex(docs);
            const target = item.name;
            const subs: vscode.TypeHierarchyItem[] = [];
            for (const entry of index.values()) {
                if (entry.parentName === target) {
                    subs.push(entryToItem(entry));
                }
            }
            return subs;
        } catch (error) {
            this.errorHandler.handleError(error, {
                component: 'ThriftTypeHierarchyProvider',
                operation: 'provideSubtypes'
            });
            return [];
        }
    }

    private parseDocument(document: vscode.TextDocument): nodes.ThriftDocument | null {
        try {
            return ThriftParser.parseWithCacheByVersion(
                document.uri.fsPath,
                document.getText(),
                document.version
            );
        } catch {
            return null;
        }
    }

    private async loadAst(uri: vscode.Uri): Promise<nodes.ThriftDocument | null> {
        try {
            const open = vscode.workspace.textDocuments.find(d => d.uri.toString() === uri.toString());
            const text = open ? open.getText() : await this.readFile(uri);
            if (text === null) {
                return null;
            }
            return new ThriftParser(text).parse();
        } catch {
            return null;
        }
    }

    private async readFile(uri: vscode.Uri): Promise<string | null> {
        try {
            const content = await vscode.workspace.fs.readFile(uri);
            return this.decoder.decode(content);
        } catch {
            return null;
        }
    }

    private async getWorkspaceDocuments(): Promise<DocPair[]> {
        const out: DocPair[] = [];
        if (vscode.workspace === undefined) {
            return out;
        }
        const files = await vscode.workspace.findFiles(config.filePatterns.thrift);
        for (const file of files) {
            const ast = await this.loadAst(file);
            if (ast) {
                out.push({uri: file, ast});
            }
        }
        return out;
    }
}

function nodeToEntry(node: nodes.ThriftNode, uri: vscode.Uri): TypeEntry {
    switch (node.type) {
        case nodes.ThriftNodeType.Struct:
            return {name: node.name ?? '', node, uri, kind: vscode.SymbolKind.Struct, detail: `struct ${node.name ?? ''}`};
        case nodes.ThriftNodeType.Union:
            return {name: node.name ?? '', node, uri, kind: vscode.SymbolKind.Struct, detail: `union ${node.name ?? ''}`};
        case nodes.ThriftNodeType.Exception:
            return {name: node.name ?? '', node, uri, kind: vscode.SymbolKind.Class, detail: `exception ${node.name ?? ''}`};
        case nodes.ThriftNodeType.Enum:
            return {name: node.name ?? '', node, uri, kind: vscode.SymbolKind.Enum, detail: `enum ${node.name ?? ''}`};
        case nodes.ThriftNodeType.Service:
            return {
                name: node.name ?? '', node, uri,
                kind: vscode.SymbolKind.Interface,
                detail: `service ${node.name ?? ''}`,
                parentName: node.extends
            };
        case nodes.ThriftNodeType.Interaction:
            return {name: node.name ?? '', node, uri, kind: vscode.SymbolKind.Interface, detail: `interaction ${node.name ?? ''}`};
        case nodes.ThriftNodeType.Typedef:
            return {
                name: node.name ?? '', node, uri,
                kind: vscode.SymbolKind.TypeParameter,
                detail: `typedef ${node.aliasType} ${node.name ?? ''}`,
                parentName: extractBaseTypeName(node.aliasType)
            };
        default:
            return {name: node.name ?? '', node, uri, kind: vscode.SymbolKind.Object ?? 0, detail: node.name ?? ''};
    }
}

function entryToItem(entry: TypeEntry): vscode.TypeHierarchyItem {
    return new vscode.TypeHierarchyItem(
        entry.kind,
        entry.name,
        entry.detail,
        entry.uri,
        toVscodeRange(entry.node.range),
        toVscodeRange(entry.node.nameRange ?? entry.node.range)
    );
}

export function registerTypeHierarchyProvider(
    context: vscode.ExtensionContext,
    deps?: Partial<CoreDependencies>
): ThriftTypeHierarchyProvider {
    const provider = new ThriftTypeHierarchyProvider(deps);
    context.subscriptions.push(
        vscode.languages.registerTypeHierarchyProvider('thrift', provider)
    );
    return provider;
}
