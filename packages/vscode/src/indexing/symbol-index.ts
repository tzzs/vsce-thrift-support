import * as vscode from 'vscode';
import {nodes} from '@tanzz/thrift-core';

export interface IndexedThriftSymbol {
    name: string;
    kind: nodes.ThriftNodeType;
    uri: vscode.Uri;
    range: vscode.Range;
    nameRange: vscode.Range;
    namespace?: string;
}

export class SymbolIndex {
    private readonly byName = new Map<string, IndexedThriftSymbol[]>();
    private readonly allSymbols: IndexedThriftSymbol[] = [];

    public clear(): void {
        this.byName.clear();
        this.allSymbols.length = 0;
    }

    public add(symbol: IndexedThriftSymbol): void {
        const symbols = this.byName.get(symbol.name) ?? [];
        symbols.push(symbol);
        this.byName.set(symbol.name, symbols);
        this.allSymbols.push(symbol);
    }

    public findByName(name: string): IndexedThriftSymbol[] {
        return [...(this.byName.get(name) ?? [])];
    }

    public getAll(): IndexedThriftSymbol[] {
        return [...this.allSymbols];
    }
}
