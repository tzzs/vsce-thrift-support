import * as vscode from 'vscode';
import {ThriftParser} from '../ast/parser';
import * as nodes from '../ast/nodes.types';
import {config} from '../config';
import {MemoryAwareCacheManager} from '../utils/cache-manager';

// Initialize the memory-aware cache manager
const cacheManager = MemoryAwareCacheManager.getInstance();

// Register the AST cache configuration
cacheManager.registerCache('references-ast', {
    maxSize: config.cache.references.maxSize,
    ttl: config.cache.references.ttlMs,
    lruK: config.cache.references.lruK,
    evictionThreshold: config.cache.references.evictionThreshold || 0.8,
    priorityFn: () => {
        const stats = cacheManager.getCacheStats('references-ast');
        return stats.hitRate > 0.7 ? 1 : 0;
    },
    sizeEstimator: (key: string, value: unknown) => {
        // Estimate memory usage based on the file path length and content length
        // Since AST objects may have circular references, we'll estimate based on simpler metrics
        try {
            let contentHashLength = 0;
            if (typeof value === 'object' && value) {
                const record = value as {contentHash?: unknown};
                if (typeof record.contentHash === 'string') {
                    contentHashLength = record.contentHash.length;
                }
            }
            return key.length + contentHashLength;
        } catch (e) {
            // Fallback to a simple size if there are issues
            return 100; // Default size
        }
    }
});

interface CachedAstEntry {
    ast: nodes.ThriftDocument;
    contentHash: string;
}

/**
 * Cache ASTs with TTL to avoid repeated parsing.
 */
export class AstCache {
    constructor(ttlMs: number = config.references.astCacheTtlMs) {
        if (ttlMs !== config.cache.references.ttlMs) {
            cacheManager.registerCache('references-ast', {
                maxSize: config.cache.references.maxSize,
                ttl: ttlMs,
                lruK: config.cache.references.lruK,
                evictionThreshold: config.cache.references.evictionThreshold || 0.8,
                priorityFn: () => {
                    const stats = cacheManager.getCacheStats('references-ast');
                    return stats.hitRate > 0.7 ? 1 : 0;
                },
                sizeEstimator: (key: string, value: unknown) => {
                    try {
                        let contentHashLength = 0;
                        if (typeof value === 'object' && value) {
                            const record = value as {contentHash?: unknown};
                            if (typeof record.contentHash === 'string') {
                                contentHashLength = record.contentHash.length;
                            }
                        }
                        return key.length + contentHashLength;
                    } catch {
                        return 100;
                    }
                }
            });
        }
    }

    /**
     * Get AST from cache or parse a new one.
     * @param document - Document to parse.
     * @returns Parsed AST document.
     */
    public get(document: vscode.TextDocument): nodes.ThriftDocument {
        const cacheKey = document.uri.fsPath;
        const contentHash = this.hashContent(document.getText()); // Hash content for comparison
        const cached = cacheManager.get<CachedAstEntry>('references-ast', cacheKey);

        if (cached && cached.contentHash === contentHash) {
            return cached.ast;
        }

        const parser = new ThriftParser(document);
        const ast = parser.parse();

        cacheManager.set('references-ast', cacheKey, {ast, contentHash});

        return ast;
    }

    /**
     * Helper to create a simple hash of content
     */
    private hashContent(content: string): string {
        let hash = 0;
        for (let i = 0; i < content.length; i++) {
            const char = content.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return hash.toString();
    }

    /**
     * Clear all cached ASTs.
     */
    public clear(): void {
        cacheManager.clear('references-ast');
    }

    /**
     * Remove cached AST for the given file path.
     * @param filePath - File system path to remove.
     */
    public delete(filePath: string): void {
        cacheManager.delete('references-ast', filePath);
    }
}
