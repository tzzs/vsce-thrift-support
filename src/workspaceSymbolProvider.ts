import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export class ThriftWorkspaceSymbolProvider implements vscode.WorkspaceSymbolProvider {
    private cachedSymbols: Map<string, vscode.SymbolInformation[]> = new Map();
    private fileWatcher: vscode.FileSystemWatcher | undefined;

    constructor() {
        // Watch for changes to Thrift files
        this.fileWatcher = vscode.workspace.createFileSystemWatcher('**/*.thrift');

        if (this.fileWatcher && this.fileWatcher.onDidCreate) {
            this.fileWatcher.onDidCreate((uri: vscode.Uri) => {
                this.cachedSymbols.delete(uri.fsPath);
            });

            this.fileWatcher.onDidChange((uri: vscode.Uri) => {
                this.cachedSymbols.delete(uri.fsPath);
            });

            this.fileWatcher.onDidDelete((uri: vscode.Uri) => {
                this.cachedSymbols.delete(uri.fsPath);
            });
        }
    }

    public async provideWorkspaceSymbols(
        query: string,
        token: vscode.CancellationToken
    ): Promise<vscode.SymbolInformation[]> {
        const allSymbols: vscode.SymbolInformation[] = [];
        const thriftFiles = await vscode.workspace.findFiles('**/*.thrift', '**/node_modules/**');

        for (const file of thriftFiles) {
            if (token.isCancellationRequested) {
                break;
            }

            try {
                const symbols = await this.getSymbolsForFile(file);
                allSymbols.push(...symbols);
            } catch (error) {
                console.error(`Error parsing symbols from ${file.fsPath}:`, error);
            }
        }

        // Filter by query if provided
        if (query) {
            const lowerQuery = query.toLowerCase();
            return allSymbols.filter(symbol =>
                symbol.name.toLowerCase().includes(lowerQuery) ||
                symbol.containerName.toLowerCase().includes(lowerQuery)
            );
        }

        return allSymbols;
    }

    private async getSymbolsForFile(uri: vscode.Uri): Promise<vscode.SymbolInformation[]> {
        // Check cache first
        if (this.cachedSymbols.has(uri.fsPath)) {
            return this.cachedSymbols.get(uri.fsPath)!;
        }

        const document = await vscode.workspace.openTextDocument(uri);
        const text = document.getText();
        const symbols = this.parseSymbolsFromText(text, uri);

        // Cache the results
        this.cachedSymbols.set(uri.fsPath, symbols);
        return symbols;
    }

    private parseSymbolsFromText(text: string, uri: vscode.Uri): vscode.SymbolInformation[] {
        const symbols: vscode.SymbolInformation[] = [];
        const lines = text.split('\n');

        let inBlock = false;
        let currentType = '';
        let currentTypeName = '';
        let braceDepth = 0;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();

            // Skip empty lines and comments
            if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) {
                continue;
            }

            // Track brace depth
            if (trimmed.includes('{')) {
                braceDepth++;
                inBlock = true;
            }
            if (trimmed.includes('}')) {
                braceDepth--;
                if (braceDepth === 0) {
                    inBlock = false;
                    currentType = '';
                    currentTypeName = '';
                }
            }

            // Parse type definitions
            const typedefMatch = trimmed.match(/^typedef\s+([A-Za-z_][A-Za-z0-9_]*)\s+([A-Za-z_][A-Za-z0-9_]*)/);
            const typeDefMatch = trimmed.match(/^(struct|union|exception|enum|senum|service)\s+([A-Za-z_][A-Za-z0-9_]*)/);
            const constMatch = trimmed.match(/^const\s+([A-Za-z_][A-Za-z0-9_]*)\s+([A-Za-z_][A-Za-z0-9_]*)/);

            if (typedefMatch) {
                const typedefType = typedefMatch[1];
                const typedefName = typedefMatch[2];
                const symbol = new vscode.SymbolInformation(
                    typedefName,
                    vscode.SymbolKind.TypeParameter,
                    '', // containerName
                    new vscode.Location(uri, new vscode.Range(i, 0, i, line.length))
                );
                symbols.push(symbol);
                continue;
            }

            if (constMatch) {
                const constType = constMatch[1];
                const constName = constMatch[2];
                const symbol = new vscode.SymbolInformation(
                    constName,
                    vscode.SymbolKind.Constant,
                    '', // containerName
                    new vscode.Location(uri, new vscode.Range(i, 0, i, line.length))
                );
                symbols.push(symbol);
                continue;
            }

            if (typeDefMatch) {
                const type = typeDefMatch[1];
                const name = typeDefMatch[2];
                const kind = this.getSymbolKind(type);

                const symbol = new vscode.SymbolInformation(
                    name,
                    kind,
                    '', // containerName
                    new vscode.Location(uri, new vscode.Range(i, 0, i, line.length))
                );

                symbols.push(symbol);

                if (['struct', 'union', 'exception', 'enum', 'senum', 'service'].includes(type)) {
                    currentType = type;
                    currentTypeName = name;
                }
                continue;
            }

            // Parse namespace
            const namespaceMatch = trimmed.match(/^namespace\s+([A-Za-z_][A-Za-z0-9_]*)\s+([A-Za-z_][A-Za-z0-9_]*)/);
            if (namespaceMatch) {
                const language = namespaceMatch[1];
                const namespace = namespaceMatch[2];
                const symbol = new vscode.SymbolInformation(
                    `namespace ${language}`,
                    vscode.SymbolKind.Namespace,
                    '',
                    new vscode.Location(uri, new vscode.Range(i, 0, i, line.length))
                );
                symbols.push(symbol);
                continue;
            }

            // Parse include
            const includeMatch = trimmed.match(/^include\s+["']([^"']+)["']/);
            if (includeMatch) {
                const fileName = includeMatch[1];
                const symbol = new vscode.SymbolInformation(
                    `include ${fileName}`,
                    vscode.SymbolKind.File,
                    '',
                    new vscode.Location(uri, new vscode.Range(i, 0, i, line.length))
                );
                symbols.push(symbol);
                continue;
            }

            // Parse child symbols if we're in a block
            if (inBlock && currentType) {
                const childSymbols = this.parseChildSymbols(line, i, currentType, currentTypeName, uri);
                symbols.push(...childSymbols);
            }
        }

        return symbols;
    }

    private parseChildSymbols(line: string, lineNumber: number, parentType: string, parentName: string, uri: vscode.Uri): vscode.SymbolInformation[] {
        const symbols: vscode.SymbolInformation[] = [];

        if (parentType === 'struct' || parentType === 'union' || parentType === 'exception') {
            // Parse field: 1: required string name,
            const fieldMatch = line.match(/^(\s*)(\d+)\s*:\s*(?:required|optional)?\s*([^\s,]+(?:\s*<[^>]+>\s*)?)\s+([A-Za-z_][A-Za-z0-9_]*)/);
            if (fieldMatch) {
                const fieldId = fieldMatch[2];
                const fieldType = fieldMatch[3];
                const fieldName = fieldMatch[4];

                const symbol = new vscode.SymbolInformation(
                    fieldName,
                    vscode.SymbolKind.Field,
                    parentName,
                    new vscode.Location(uri, new vscode.Range(lineNumber, 0, lineNumber, line.length))
                );

                symbols.push(symbol);
            }
        } else if (parentType === 'enum' || parentType === 'senum') {
            // Parse enum value: VALUE = 1,
            const enumMatch = line.match(/^(\s*)([A-Za-z_][A-Za-z0-9_]*)\s*(?:=\s*([^,;]+))?[,;]?/);
            if (enumMatch && !line.includes('}')) {
                const valueName = enumMatch[2];

                const symbol = new vscode.SymbolInformation(
                    valueName,
                    vscode.SymbolKind.EnumMember,
                    parentName,
                    new vscode.Location(uri, new vscode.Range(lineNumber, 0, lineNumber, line.length))
                );

                symbols.push(symbol);
            }
        } else if (parentType === 'service') {
            // Parse service method: ReturnType methodName(1: ParamType param),
            const methodMatch = line.match(/^(\s*)(oneway\s+)?([A-Za-z_][A-Za-z0-9_]*(?:\s*<[^>]+>\s*)?)\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/);
            if (methodMatch) {
                const methodName = methodMatch[4];

                const symbol = new vscode.SymbolInformation(
                    methodName,
                    vscode.SymbolKind.Method,
                    parentName,
                    new vscode.Location(uri, new vscode.Range(lineNumber, 0, lineNumber, line.length))
                );

                symbols.push(symbol);
            }
        }

        return symbols;
    }

    private getSymbolKind(type: string): vscode.SymbolKind {
        switch (type) {
            case 'struct': return vscode.SymbolKind.Struct;
            case 'union': return vscode.SymbolKind.Struct;
            case 'exception': return vscode.SymbolKind.Class;
            case 'enum': return vscode.SymbolKind.Enum;
            case 'senum': return vscode.SymbolKind.Enum;
            case 'service': return vscode.SymbolKind.Interface;
            case 'typedef': return vscode.SymbolKind.TypeParameter;
            case 'const': return vscode.SymbolKind.Constant;
            default: return vscode.SymbolKind.Variable;
        }
    }

    dispose() {
        if (this.fileWatcher) {
            this.fileWatcher.dispose();
        }
        this.cachedSymbols.clear();
    }
}

export function registerWorkspaceSymbolProvider(context: vscode.ExtensionContext) {
    const provider = new ThriftWorkspaceSymbolProvider();
    const disposable = vscode.languages.registerWorkspaceSymbolProvider(provider);
    context.subscriptions.push(disposable);
    context.subscriptions.push(provider); // for dispose()
}