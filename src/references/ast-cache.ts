import * as vscode from 'vscode';
import {ThriftParser} from '../ast/parser';
import * as nodes from '../ast/nodes.types';
import {config} from '../config';
import {MemoryAwareCacheManager} from '../utils/cache-manager'; // Import the enhanced cache manager
import {isFresh} from '../utils/cache-expiry';

// Initialize the memory-aware cache manager
const cacheManager = MemoryAwareCacheManager.getInstance();

// Register the AST cache configuration
cacheManager.registerCache('references-ast', {
    maxSize: config.cache.references.maxSize,
    ttl: config.cache.references.ttlMs,
    lruK: config.cache.references.lruK,
    evictionThreshold: config.cache.references.evictionThreshold || 0.8,
    priorityFn: (key: string, value: any) => {
        // Higher priority for more frequently accessed files
        const stats = cacheManager.getCacheStats('references-ast');
        return stats.hitRate > 0.7 ? 1 : 0; // High priority if hit rate is high
    },
    sizeEstimator: (key: string, value: any) => {
        // Estimate memory usage based on the file path length and content length
        // Since AST objects may have circular references, we'll estimate based on simpler metrics
        try {
            return key.length + (value?.contentHash?.length || 0);
        } catch (e) {
            // Fallback to a simple size if there are issues
            return 100; // Default size
        }
    }
});

interface CachedAstEntry {
    ast: nodes.ThriftDocument;
    timestamp: number;
    contentHash: string;
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
        const contentHash = this.hashContent(document.getText()); // Hash content for comparison
        const now = Date.now();
        const cached = this.cache.get(cacheKey);

        if (cached && cached.contentHash === contentHash && isFresh(cached.timestamp, this.ttlMs, now)) {
            // Notify the cache manager about access for memory awareness
            cacheManager.get('references-ast', cacheKey);
            return cached.ast;
        }

        const parser = new ThriftParser(document);
        const ast = parser.parse();

        // Store in our local cache
        this.cache.set(cacheKey, {
            ast,
            timestamp: now,
            contentHash
        });

        // Also notify the centralized cache manager
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
        this.cache.clear();
        // Also clear in the centralized cache manager
        cacheManager.clear('references-ast');
    }

    /**
     * Remove cached AST for the given file path.
     * @param filePath - File system path to remove.
     */
    public delete(filePath: string): void {
        this.cache.delete(filePath);
        // Also delete from the centralized cache manager
        cacheManager.delete('references-ast', filePath);
    }
}
