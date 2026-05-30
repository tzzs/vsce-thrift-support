import * as vscode from 'vscode';
import {collectTopLevelTypes, nodes, ThriftParser} from '@tanzz/thrift-core';
import {toVscodeRange} from '../utils/vscode-utils';
import {IndexedThriftSymbol, SymbolIndex} from './symbol-index';

export interface WorkspaceIndexDeps {
    findFiles?: () => Thenable<vscode.Uri[]> | Promise<vscode.Uri[]>;
    readFile?: (uri: vscode.Uri) => Thenable<string> | Promise<string>;
    createWatcher?: () => vscode.Disposable;
}

export class WorkspaceIndex implements vscode.Disposable {
    private readonly symbols = new SymbolIndex();
    private readonly disposables: vscode.Disposable[] = [];

    constructor(private readonly deps: WorkspaceIndexDeps = {}) {
        if (deps.createWatcher) {
            this.disposables.push(deps.createWatcher());
        }
    }

    public async refresh(): Promise<void> {
        this.symbols.clear();
        const files = await this.findFiles();
        for (const uri of files) {
            const text = await this.readFile(uri);
            const ast = ThriftParser.parseContentWithCache(uri.toString(), text);
            for (const node of collectTopLevelTypes(ast)) {
                if (typeof node.name !== 'string' || node.name.length === 0) {
                    continue;
                }
                this.symbols.add(this.toIndexedSymbol(uri, node));
            }
        }
    }

    public findSymbolsByName(name: string): IndexedThriftSymbol[] {
        return this.symbols.findByName(name);
    }

    public getAllSymbols(): IndexedThriftSymbol[] {
        return this.symbols.getAll();
    }

    public dispose(): void {
        for (const disposable of this.disposables) {
            disposable.dispose();
        }
        this.disposables.length = 0;
        this.symbols.clear();
    }

    private async findFiles(): Promise<vscode.Uri[]> {
        if (this.deps.findFiles) {
            return this.deps.findFiles();
        }
        return vscode.workspace.findFiles('**/*.thrift', '**/node_modules/**');
    }

    private async readFile(uri: vscode.Uri): Promise<string> {
        if (this.deps.readFile) {
            return this.deps.readFile(uri);
        }
        const content = await vscode.workspace.fs.readFile(uri);
        return new TextDecoder('utf-8').decode(content);
    }

    private toIndexedSymbol(uri: vscode.Uri, node: nodes.ThriftNode): IndexedThriftSymbol {
        return {
            name: node.name ?? '',
            kind: node.type,
            uri,
            range: toVscodeRange(node.range),
            nameRange: toVscodeRange(node.nameRange ?? node.range)
        };
    }
}
