import * as vscode from 'vscode';
import { ThriftParser } from '../ast/parser';
import * as nodes from '../ast/nodes.types';
import { config } from '../config';

interface CachedAstEntry {
    ast: nodes.ThriftDocument;
    timestamp: number;
}

/**
 * Cache ASTs with TTL to avoid repeated parsing.
 */
export class AstCache {
    private cache: Map<string, CachedAstEntry> = new Map();
    private readonly ttlMs: number;

    constructor(ttlMs: number = config.references.astCacheTtlMs) {
        this.ttlMs = ttlMs;
    }

    /**
     * Get AST from cache or parse a new one.
     * @param document - Document to parse.
     * @returns Parsed AST document.
     */
    public get(document: vscode.TextDocument): nodes.ThriftDocument {
        const cacheKey = document.uri.fsPath;
        const now = Date.now();
        const cached = this.cache.get(cacheKey);
        if (cached && (now - cached.timestamp) < this.ttlMs) {
            return cached.ast;
        }

        const parser = new ThriftParser(document);
        const ast = parser.parse();
        this.cache.set(cacheKey, { ast, timestamp: now });
        return ast;
    }

    /**
     * Clear all cached ASTs.
     */
    public clear(): void {
        this.cache.clear();
    }

    /**
     * Remove cached AST for the given file path.
     * @param filePath - File system path to remove.
     */
    public delete(filePath: string): void {
        this.cache.delete(filePath);
    }
}
