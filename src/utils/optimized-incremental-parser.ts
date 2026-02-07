import * as vscode from 'vscode';
import {IncrementalParseResult, OptimizedThriftParser} from '../ast/optimized-parser';
import {LineRange} from './line-range';
import {performanceMonitor} from '../performance-monitor';
import {ChangeType, IncrementalTracker} from './incremental-tracker';
import {ErrorHandler} from './error-handler';

/**
 * Incremental parsing manager that coordinates between the parser, cache, tracker and performance monitoring.
 */
export class OptimizedIncrementalParserManager {
    private static instance: OptimizedIncrementalParserManager;
    private errorHandler = ErrorHandler.getInstance();

    static getInstance(): OptimizedIncrementalParserManager {
        if (!this.instance) {
            this.instance = new OptimizedIncrementalParserManager();
        }
        return this.instance;
    }

    /**
     * Perform incremental parsing of a Thrift document based on the dirty range provided by the tracker.
     * Falls back to full parsing if incremental parsing fails or if the dirty range is too large.
     */
    public async parseIncrementally(
        document: vscode.TextDocument,
        dirtyRange?: LineRange
    ): Promise<IncrementalParseResult> {
        return performanceMonitor.measureAsync('optimized-incremental-parser.parseIncrementally', async () => {
            // If no dirty range is provided, get it from the tracker
            if (!dirtyRange) {
                const tracker = IncrementalTracker.getInstance();
                dirtyRange = tracker.consumeDirtyRange(document);

                // If the tracker doesn't have a dirty range, do a full parse
                if (!dirtyRange) {
                    return await this.parseFull(document);
                }
            }

            // First, let's check if the dirty range is too large for incremental parsing
            const rangeSize = dirtyRange.endLine - dirtyRange.startLine + 1;

            // If the change affects a significant portion of the document, do a full parse instead
            if (rangeSize > Math.max(20, document.lineCount / 4)) { // If more than 25% of document changed or > 20 lines
                return await this.parseFull(document);
            }

            if (!dirtyRange) {
                return await this.parseFull(document);
            }
            const range = dirtyRange;

            const result = this.errorHandler.wrapSync(
                () => OptimizedThriftParser.incrementalParseWithCache(document, range),
                {
                    component: 'OptimizedIncrementalParserManager',
                    operation: 'incrementalParseWithCache',
                    filePath: document.uri.fsPath
                },
                null
            );

            if (result) {
                // Successfully performed incremental parsing
                return result;
            }

            // Fallback to full parsing if incremental parsing isn't available
            return await this.parseFull(document);
        }, document);
    }

    /**
     * Perform full parsing of a Thrift document.
     */
    private async parseFull(document: vscode.TextDocument): Promise<IncrementalParseResult> {
        return performanceMonitor.measureAsync('optimized-incremental-parser.parseFull', async () => {
            const ast = await Promise.resolve(this.errorHandler.wrapSync(
                () => OptimizedThriftParser.parseWithCache(document),
                {
                    component: 'OptimizedIncrementalParserManager',
                    operation: 'parseWithCache',
                    filePath: document.uri.fsPath
                }
            ));

            return {
                ast,
                affectedNodes: [], // For full parse, we consider all nodes as potentially affected
                newNodes: ast.body  // All nodes are effectively "new" in a full parse context
            };
        }, document);
    }

    /**
     * Perform performance-comparison parsing that measures both incremental and full parsing times.
     */
    public async parseWithPerformanceComparison(
        document: vscode.TextDocument,
        dirtyRange?: LineRange
    ): Promise<{result: IncrementalParseResult; wasIncremental: boolean; improvement: number}> {
        // Since measureIncrementalParsing is synchronous, we need to handle async operations differently
        // First measure full parse time
        let fullDuration = 0;
        let incrementalDuration = 0;
        let result: IncrementalParseResult;
        let wasIncremental = false;
        let improvement = 0;

        // Measure full parse (convert to sync by awaiting first)
        const startFull = performance.now();
        const fullResult = await this.parseFull(document);
        fullDuration = performance.now() - startFull;

        // Measure incremental parse if dirty range is provided
        if (dirtyRange) {
            const startIncremental = performance.now();
            result = await this.parseIncrementally(document, dirtyRange);
            incrementalDuration = performance.now() - startIncremental;
            wasIncremental = true;

            if (fullDuration > 0) {
                improvement = ((fullDuration - incrementalDuration) / fullDuration * 100);
            }
        } else {
            // If no dirty range, use full parse result
            result = fullResult;
            wasIncremental = false;
        }

        return {result, wasIncremental, improvement};
    }

    /**
     * Synchronous version of full parse for performance comparison
     */
    private parseFullSync(document: vscode.TextDocument): IncrementalParseResult {
        const ast = OptimizedThriftParser.parseWithCache(document);

        return {
            ast,
            affectedNodes: [], // For full parse, we consider all nodes as potentially affected
            newNodes: ast.body  // All nodes are effectively "new" in a full parse context
        };
    }

    /**
     * Synchronous version of incremental parse for performance comparison
     */
    private parseIncrementallySync(document: vscode.TextDocument, dirtyRange?: LineRange): IncrementalParseResult {
        // If no dirty range, fallback to full parsing
        if (!dirtyRange) {
            return this.parseFullSync(document);
        }

        // Use the static incremental parse method from OptimizedThriftParser
        const result = OptimizedThriftParser.incrementalParseWithCache(document, dirtyRange);

        if (result) {
            // Successfully performed incremental parsing
            return result;
        } else {
            // Fallback to full parsing if incremental parsing isn't available
            return this.parseFullSync(document);
        }
    }
}

/**
 * Helper function to setup document change tracking for incremental parsing.
 */
export function setupIncrementalParsingTracking(context: vscode.ExtensionContext): void {
    const tracker = IncrementalTracker.getInstance();

    // Subscribe to document changes to track dirty ranges for incremental parsing
    const disposable = vscode.workspace.onDidChangeTextDocument(event => {
        // Only track changes for Thrift documents
        if (event.document.languageId === 'thrift') {
            // Mark changes specifically for parsing
            tracker.markChanges(event, ChangeType.PARSING);
        }
    });

    context.subscriptions.push(disposable);
}
