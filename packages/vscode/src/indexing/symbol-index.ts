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
    private readonly byNamespaceAndName = new Map<string, IndexedThriftSymbol[]>();
    private readonly allSymbols: IndexedThriftSymbol[] = [];

    public clear(): void {
        this.byName.clear();
        this.byNamespaceAndName.clear();
        this.allSymbols.length = 0;
    }

    public add(symbol: IndexedThriftSymbol): void {
        const symbols = this.byName.get(symbol.name) ?? [];
        symbols.push(symbol);
        this.byName.set(symbol.name, symbols);
        if (typeof symbol.namespace === 'string' && symbol.namespace.length > 0) {
            const namespacedKey = this.makeNamespacedKey(symbol.name, symbol.namespace);
            const namespacedSymbols = this.byNamespaceAndName.get(namespacedKey) ?? [];
            namespacedSymbols.push(symbol);
            this.byNamespaceAndName.set(namespacedKey, namespacedSymbols);
        }
        this.allSymbols.push(symbol);
    }

    public findByName(name: string): IndexedThriftSymbol[] {
        return [...(this.byName.get(name) ?? [])];
    }

    public findByNameAndNamespace(name: string, namespace: string): IndexedThriftSymbol[] {
        return [...(this.byNamespaceAndName.get(this.makeNamespacedKey(name, namespace)) ?? [])];
    }

    public getAll(): IndexedThriftSymbol[] {
        return [...this.allSymbols];
    }

    private makeNamespacedKey(name: string, namespace: string): string {
        return `${namespace}.${name}`;
    }
}
