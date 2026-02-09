import * as vscode from 'vscode';
import {ThriftFormatter} from '../formatter';
import {config} from '../config';
import {ThriftParser} from '../ast/parser';
import * as nodes from '../ast/nodes.types';
import {IncrementalTracker} from '../utils/incremental-tracker';
import {ErrorHandler} from '../utils/error-handler';
import {CoreDependencies} from '../utils/dependencies';
import {collapseLineRanges, LineRange, lineRangeToVscodeRange} from '../utils/line-range';
import {computeInitialContext} from './context';
import {buildMinimalEdits, normalizeFormattingRange} from './range-utils';
import {resolveFormattingOptions} from './options';

const structuralNodeTypes = new Set<nodes.ThriftNodeType>([
    nodes.ThriftNodeType.Struct,
    nodes.ThriftNodeType.Union,
    nodes.ThriftNodeType.Exception,
    nodes.ThriftNodeType.Enum,
    nodes.ThriftNodeType.Service,
    nodes.ThriftNodeType.Const
]);

function lineRangesOverlap(a: LineRange, b: LineRange): boolean {
    return a.startLine <= b.endLine && b.startLine <= a.endLine;
}

function getChildNodes(node: nodes.ThriftNode): nodes.ThriftNode[] {
    const children: nodes.ThriftNode[] = [];
    if ('body' in node && Array.isArray(node.body)) {
        children.push(...node.body);
    }
    if ('fields' in node && Array.isArray(node.fields)) {
        children.push(...node.fields);
    }
    if ('members' in node && Array.isArray(node.members)) {
        children.push(...node.members);
    }
    if ('functions' in node && Array.isArray(node.functions)) {
        children.push(...node.functions);
    }
    if (node.children && node.children.length > 0) {
        children.push(...node.children);
    }
    return children;
}

/**
 * Expands a line range to include complete structural blocks (struct, enum, service, etc.).
 * This ensures that incremental formatting doesn't break structural integrity by formatting
 * only part of a block.
 *
 * @param document - The text document being formatted
 * @param range - The initial line range to expand
 * @returns Expanded line range that encompasses all overlapping structural blocks,
 *          or the original range if AST parsing fails
 */
function expandRangeToStructuralBlocks(
    document: vscode.TextDocument,
    range: LineRange
): LineRange {
    try {
        const ast = ThriftParser.parseWithCache(document);
        const ranges: LineRange[] = [range];
        const visit = (node: nodes.ThriftNode) => {
            if (node.range) {
                const nodeRange: LineRange = {
                    startLine: node.range.start.line,
                    endLine: node.range.end.line
                };
                if (structuralNodeTypes.has(node.type) && lineRangesOverlap(nodeRange, range)) {
                    ranges.push(nodeRange);
                }
            }
            const children = getChildNodes(node);
            children.forEach(visit);
        };
        visit(ast);
        return collapseLineRanges(ranges) ?? range;
    } catch {
        return range;
    }
}

/**
 * ThriftFormattingProvider：提供文档与选区格式化。
 */
export class ThriftFormattingProvider implements vscode.DocumentFormattingEditProvider, vscode.DocumentRangeFormattingEditProvider {
    private incrementalTracker: IncrementalTracker;
    private errorHandler: ErrorHandler;

    constructor(deps?: Partial<CoreDependencies>) {
        this.incrementalTracker = deps?.incrementalTracker ?? IncrementalTracker.getInstance();
        this.errorHandler = deps?.errorHandler ?? new ErrorHandler();
    }

    /**
     * 格式化整个文档。
     */
    provideDocumentFormattingEdits(
        document: vscode.TextDocument,
        options: vscode.FormattingOptions,
        token: vscode.CancellationToken
    ): vscode.TextEdit[] {
        try {
            void token;
            let targetRange: vscode.Range | undefined;
            let useMinimalPatch = false;

            // 增量格式化：在脏区范围内尝试最小化编辑
            if (config.incremental.formattingEnabled) {
                const dirtyRange = this.incrementalTracker.consumeDirtyRange(document);
                if (dirtyRange) {
                    const expandedRange = expandRangeToStructuralBlocks(document, dirtyRange);
                    targetRange = normalizeFormattingRange(
                        document,
                        lineRangeToVscodeRange(document, expandedRange)
                    );
                    useMinimalPatch = true;
                }
            }

            const fullRange = new vscode.Range(
                document.positionAt(0),
                document.positionAt(document.getText().length)
            );

            return this.formatRange(document, targetRange ?? fullRange, options, useMinimalPatch);
        } catch (error) {
            this.errorHandler.handleError(error, {
                component: 'ThriftFormattingProvider',
                operation: 'provideDocumentFormattingEdits',
                filePath: document.uri.fsPath
            });
            return [];
        }
    }

    /**
     * 格式化指定范围。
     */
    provideDocumentRangeFormattingEdits(
        document: vscode.TextDocument,
        range: vscode.Range,
        options: vscode.FormattingOptions,
        token: vscode.CancellationToken
    ): vscode.TextEdit[] {
        try {
            void token;
            return this.formatRange(document, range, options);
        } catch (error) {
            this.errorHandler.handleError(error, {
                component: 'ThriftFormattingProvider',
                operation: 'provideDocumentRangeFormattingEdits',
                filePath: document.uri.fsPath,
                additionalInfo: {range: `${range.start.line}:${range.start.character}-${range.end.line}:${range.end.character}`}
            });
            return [];
        }
    }

    private formatRange(
        document: vscode.TextDocument,
        range: vscode.Range,
        options: vscode.FormattingOptions,
        useMinimalPatch = false
    ): vscode.TextEdit[] {
        const text = document.getText(range);
        const fmtOptions = resolveFormattingOptions(document, range, options, useMinimalPatch, {
            computeInitialContext
        });
        fmtOptions.incrementalFormattingEnabled = useMinimalPatch;

        const formatter = new ThriftFormatter({errorHandler: this.errorHandler});

        let dirtyRange: LineRange | undefined;
        if (useMinimalPatch) {
            const lineCount = text.split(/\r?\n/).length;
            const startLine = 0;
            const endLine = Math.max(0, lineCount - 1);
            dirtyRange = {startLine, endLine};
        }

        const formattedText = formatter.formatThriftCode(text, fmtOptions, dirtyRange);

        if (!useMinimalPatch) {
            return [vscode.TextEdit.replace(range, formattedText)];
        }

        return buildMinimalEdits(document, range, text, formattedText);
    }
}
