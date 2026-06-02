import * as vscode from 'vscode';
import * as path from 'path';
import {collectTopLevelTypes, config, nodes, safeResolveIncludePath, ThriftParser} from '@tanzz/thrift-core';
import {createLocation, toVscodeRange} from '../utils/vscode-utils';
import {IndexedThriftSymbol, SymbolIndex} from './symbol-index';

export interface WorkspaceIndexDeps {
    findFiles?: () => Thenable<vscode.Uri[]> | Promise<vscode.Uri[]>;
    readFile?: (uri: vscode.Uri) => Thenable<string> | Promise<string>;
    createWatcher?: (invalidate: (uri?: vscode.Uri) => void) => vscode.Disposable;
    workspaceFolders?: vscode.Uri[];
}

interface IndexedInclude {
    path: string;
    uri: vscode.Uri;
    range: vscode.Range;
}

interface IndexedFile {
    uri: vscode.Uri;
    text: string;
    includes: IndexedInclude[];
    namespaces: Set<string>;
}

export class WorkspaceIndex implements vscode.Disposable {
    private readonly symbols = new SymbolIndex();
    private readonly files = new Map<string, IndexedFile>();
    private readonly disposables: vscode.Disposable[] = [];

    constructor(private readonly deps: WorkspaceIndexDeps = {}) {
        if (deps.createWatcher) {
            this.disposables.push(deps.createWatcher((uri?: vscode.Uri) => this.invalidate(uri)));
        }
    }

    public async refresh(): Promise<void> {
        this.symbols.clear();
        this.files.clear();
        const files = await this.findFiles();
        for (const uri of files) {
            await this.indexFile(uri);
        }
    }

    public findSymbolsByName(name: string): IndexedThriftSymbol[] {
        return this.symbols.findByName(name);
    }

    public findSymbolsByNameAndNamespace(name: string, namespace: string): IndexedThriftSymbol[] {
        return this.symbols.findByNameAndNamespace(name, namespace);
    }

    public getAllSymbols(): IndexedThriftSymbol[] {
        return this.symbols.getAll();
    }

    public getAllFiles(): vscode.Uri[] {
        return [...this.files.values()].map(file => file.uri);
    }

    public async getText(uri: vscode.Uri): Promise<string> {
        const key = uri.toString();
        const cached = this.files.get(key);
        if (cached !== undefined) {
            return cached.text;
        }
        const indexed = await this.indexFile(uri);
        return indexed.text;
    }

    public getIncludedUris(uri: vscode.Uri): vscode.Uri[] {
        return [...(this.files.get(uri.toString())?.includes ?? [])].map(include => include.uri);
    }

    public getIncludedUrisForText(uri: vscode.Uri, text: string, version?: number): vscode.Uri[] {
        const key = version === undefined
            ? `${uri.toString()}#includes`
            : `${uri.toString()}#includes:${version}`;
        const ast = version === undefined
            ? ThriftParser.parseContentWithCache(key, text)
            : ThriftParser.parseWithCacheByVersion(key, text, version);
        return this.collectIncludes(uri, ast).map(include => include.uri);
    }

    public findIncludeForNamespace(uri: vscode.Uri, namespace: string): vscode.Location | undefined {
        const file = this.files.get(uri.toString());
        if (file === undefined) {
            return undefined;
        }
        for (const include of file.includes) {
            if (path.basename(include.path, '.thrift') === namespace) {
                return createLocation(uri, include.range);
            }
            const includedFile = this.files.get(include.uri.toString());
            if (includedFile?.namespaces.has(namespace) === true) {
                return createLocation(uri, include.range);
            }
        }
        return undefined;
    }

    public invalidate(uri?: vscode.Uri): void {
        if (uri === undefined) {
            this.files.clear();
            this.symbols.clear();
            return;
        }
        this.files.delete(uri.toString());
        this.rebuildSymbols();
    }

    public dispose(): void {
        for (const disposable of this.disposables) {
            disposable.dispose();
        }
        this.disposables.length = 0;
        this.files.clear();
        this.symbols.clear();
    }

    private async findFiles(): Promise<vscode.Uri[]> {
        if (this.deps.findFiles) {
            return this.deps.findFiles();
        }
        return vscode.workspace.findFiles(
            config.filePatterns.thrift,
            config.filePatterns.excludeNodeModules,
            config.search.workspaceFileLimit
        );
    }

    private async readFile(uri: vscode.Uri): Promise<string> {
        if (this.deps.readFile) {
            return this.deps.readFile(uri);
        }
        const content = await vscode.workspace.fs.readFile(uri);
        return new TextDecoder('utf-8').decode(content);
    }

    private async indexFile(uri: vscode.Uri): Promise<IndexedFile> {
        const text = await this.readFile(uri);
        const ast = ThriftParser.parseContentWithCache(uri.toString(), text);
        const indexedFile: IndexedFile = {
            uri,
            text,
            includes: this.collectIncludes(uri, ast),
            namespaces: this.collectNamespaces(ast)
        };
        this.files.set(uri.toString(), indexedFile);
        for (const node of collectTopLevelTypes(ast)) {
            if (typeof node.name !== 'string' || node.name.length === 0) {
                continue;
            }
            this.symbols.add(this.toIndexedSymbol(uri, node, indexedFile.namespaces));
        }
        return indexedFile;
    }

    private collectIncludes(uri: vscode.Uri, ast: nodes.ThriftDocument): IndexedInclude[] {
        const includes: IndexedInclude[] = [];
        for (const node of ast.body) {
            if (node.type !== nodes.ThriftNodeType.Include) {
                continue;
            }
            const includeUri = this.resolveIncludeUri(uri, node.path);
            if (includeUri === undefined) {
                continue;
            }
            includes.push({
                path: node.path,
                uri: includeUri,
                range: toVscodeRange(node.range)
            });
        }
        return includes;
    }

    private collectNamespaces(ast: nodes.ThriftDocument): Set<string> {
        const namespaces = new Set<string>();
        for (const node of ast.body) {
            if (node.type === nodes.ThriftNodeType.Namespace && node.namespace.length > 0) {
                namespaces.add(node.namespace);
            }
        }
        return namespaces;
    }

    private resolveIncludeUri(sourceUri: vscode.Uri, includePath: string): vscode.Uri | undefined {
        const sourceDir = path.dirname(sourceUri.fsPath);
        const boundaryDir = this.getBoundaryDir(sourceUri) ?? sourceDir;
        const resolved = safeResolveIncludePath(includePath, sourceDir, boundaryDir);
        if (resolved === undefined) {
            return undefined;
        }
        return vscode.Uri.file(resolved);
    }

    private getBoundaryDir(sourceUri: vscode.Uri): string | undefined {
        const folders = this.deps.workspaceFolders ??
            vscode.workspace.workspaceFolders?.map(folder => folder.uri) ??
            [];
        for (const folder of folders) {
            const relative = path.relative(folder.fsPath, sourceUri.fsPath);
            if (relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))) {
                return folder.fsPath;
            }
        }
        return undefined;
    }

    private rebuildSymbols(): void {
        const files = [...this.files.values()];
        this.symbols.clear();
        for (const file of files) {
            const ast = ThriftParser.parseContentWithCache(file.uri.toString(), file.text);
            for (const node of collectTopLevelTypes(ast)) {
                if (typeof node.name !== 'string' || node.name.length === 0) {
                    continue;
                }
                this.symbols.add(this.toIndexedSymbol(file.uri, node, file.namespaces));
            }
        }
    }

    private toIndexedSymbol(
        uri: vscode.Uri,
        node: nodes.ThriftNode,
        namespaces: Set<string>
    ): IndexedThriftSymbol {
        const namespace = namespaces.values().next().value;
        return {
            name: node.name ?? '',
            kind: node.type,
            uri,
            range: toVscodeRange(node.range),
            nameRange: toVscodeRange(node.nameRange ?? node.range),
            namespace
        };
    }
}
