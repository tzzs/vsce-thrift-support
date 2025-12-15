import * as vscode from 'vscode';
import * as path from 'path';

/**
 * 最小化的工作区符号提供器 - 只在明确需要时扫描
 */
export class MinimalWorkspaceSymbolProvider implements vscode.WorkspaceSymbolProvider {
    private cachedSymbols: Map<string, vscode.SymbolInformation[]> = new Map();
    private lastScanTime: number = 0;
    private readonly MIN_SCAN_INTERVAL = 5 * 60 * 1000; // 5分钟
    private enabled: boolean = false;

    constructor() {
        // 配置项已移除，默认禁用工作区扫描
        this.enabled = false;
    }

    public async provideWorkspaceSymbols(
        query: string,
        token: vscode.CancellationToken
    ): Promise<vscode.SymbolInformation[]> {
        // 工作区符号扫描已禁用，只返回当前文档的符号
        if (!this.enabled) {
            return this.getCurrentDocumentSymbols();
        }

        // 只有当用户主动搜索时才进行扫描
        if (!query || query.trim().length < 2) {
            console.log('[MinimalWorkspaceSymbolProvider] Query too short, returning cached results');
            return this.getCachedSymbols();
        }

        const now = Date.now();
        if (now - this.lastScanTime < this.MIN_SCAN_INTERVAL) {
            console.log('[MinimalWorkspaceSymbolProvider] Scanning too frequent, using cache');
            return this.filterSymbols(this.getCachedSymbols(), query);
        }

        console.log(`[MinimalWorkspaceSymbolProvider] Performing scan for query: ${query}`);
        return await this.performScan(query, token);
    }

    private getCurrentDocumentSymbols(): vscode.SymbolInformation[] {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.languageId !== 'thrift') {
            return [];
        }

        // 只分析当前文档，不扫描整个工作区
        console.log('[MinimalWorkspaceSymbolProvider] Returning current document symbols only');
        return []; // 简化实现，实际可以解析当前文档
    }

    private getCachedSymbols(): vscode.SymbolInformation[] {
        const symbols: vscode.SymbolInformation[] = [];
        for (const [, fileSymbols] of this.cachedSymbols) {
            symbols.push(...fileSymbols);
        }
        return symbols;
    }

    private filterSymbols(symbols: vscode.SymbolInformation[], query: string): vscode.SymbolInformation[] {
        if (!query) return symbols;
        
        const lowerQuery = query.toLowerCase();
        return symbols.filter(symbol =>
            symbol.name.toLowerCase().includes(lowerQuery) ||
            symbol.containerName.toLowerCase().includes(lowerQuery)
        );
    }

    private async performScan(query: string, token: vscode.CancellationToken): Promise<vscode.SymbolInformation[]> {
        // 实际的扫描逻辑，但限制范围
        const allSymbols: vscode.SymbolInformation[] = [];
        this.lastScanTime = Date.now();

        try {
            // 只扫描已打开的文件，而不是整个工作区
            const openDocuments = vscode.workspace.textDocuments.filter(doc => 
                doc.languageId === 'thrift' && !doc.isClosed
            );

            console.log(`[MinimalWorkspaceSymbolProvider] Scanning ${openDocuments.length} open documents`);

            for (const document of openDocuments) {
                if (token.isCancellationRequested) break;
                
                // 这里可以添加实际的符号解析逻辑
                // 为简化，返回空数组
            }
        } catch (error) {
            console.error('[MinimalWorkspaceSymbolProvider] Error during scan:', error);
        }

        return this.filterSymbols(allSymbols, query);
    }
}

/**
 * 最小化的引用提供器 - 只在明确需要时扫描
 */
export class MinimalReferencesProvider implements vscode.ReferenceProvider {
    private enabled: boolean = false;

    constructor() {
        // 配置项已移除，默认禁用引用扫描
        this.enabled = false;
    }

    public async provideReferences(
        document: vscode.TextDocument,
        position: vscode.Position,
        context: vscode.ReferenceContext,
        token: vscode.CancellationToken
    ): Promise<vscode.Location[]> {
        
        if (!this.enabled) {
            console.log('[MinimalReferencesProvider] Reference scanning disabled');
            return [];
        }

        console.log('[MinimalReferencesProvider] Providing references for current document only');
        
        // 只在当前文档中查找引用，不扫描整个工作区
        return await this.findReferencesInDocument(document, position);
    }

    private async findReferencesInDocument(document: vscode.TextDocument, position: vscode.Position): Promise<vscode.Location[]> {
        const references: vscode.Location[] = [];
        const wordRange = document.getWordRangeAtPosition(position);
        
        if (!wordRange) {
            return references;
        }

        const symbolName = document.getText(wordRange);
        console.log(`[MinimalReferencesProvider] Looking for references to "${symbolName}" in current document`);

        // 简单的文本搜索，只在当前文档中
        const text = document.getText();
        const lines = text.split('\n');
        
        lines.forEach((line, lineIndex) => {
            let index = 0;
            while ((index = line.indexOf(symbolName, index)) !== -1) {
                const range = new vscode.Range(lineIndex, index, lineIndex, index + symbolName.length);
                references.push(new vscode.Location(document.uri, range));
                index += symbolName.length;
            }
        });

        console.log(`[MinimalReferencesProvider] Found ${references.length} references in current document`);
        return references;
    }
}

/**
 * 注册最小化的提供器
 */
export function registerMinimalProviders(context: vscode.ExtensionContext) {
    console.log('[MinimalProviders] Registering minimal workspace symbol and references providers');
    
    // 注册最小化的工作区符号提供器
    const symbolProvider = new MinimalWorkspaceSymbolProvider();
    context.subscriptions.push(
        vscode.languages.registerWorkspaceSymbolProvider(symbolProvider)
    );
    
    // 注册最小化的引用提供器
    const referencesProvider = new MinimalReferencesProvider();
    context.subscriptions.push(
        vscode.languages.registerReferenceProvider('thrift', referencesProvider)
    );
    
    console.log('[MinimalProviders] Minimal providers registered successfully');
} 