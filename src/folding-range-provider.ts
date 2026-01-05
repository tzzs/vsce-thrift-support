import * as vscode from 'vscode';
import { ThriftParser } from './ast/parser';
import * as nodes from './ast/nodes.types';
import { ErrorHandler } from './utils/error-handler';
import { CoreDependencies } from './utils/dependencies';

/**
 * ThriftFoldingRangeProvider：提供折叠范围。
 */

export class ThriftFoldingRangeProvider implements vscode.FoldingRangeProvider {
    private errorHandler: ErrorHandler;

    constructor(deps?: Partial<CoreDependencies>) {
        this.errorHandler = deps?.errorHandler ?? new ErrorHandler();
    }
    /**
     * 返回文档的折叠范围列表。
     */
    public provideFoldingRanges(
        document: vscode.TextDocument,
        _context: vscode.FoldingContext,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.FoldingRange[]> {
        try {
            const ranges: vscode.FoldingRange[] = [];
            const text = document.getText();
            const lines = text.split('\n');

            if (lines.length === 0) {
                return ranges;
            }

            const ast = ThriftParser.parseWithCache(document);
            for (const node of ast.body) {
                if (token.isCancellationRequested) {
                    return ranges;
                }
                if (node.type === nodes.ThriftNodeType.Struct ||
                    node.type === nodes.ThriftNodeType.Union ||
                    node.type === nodes.ThriftNodeType.Exception ||
                    node.type === nodes.ThriftNodeType.Enum ||
                    node.type === nodes.ThriftNodeType.Service) {
                    const range = this.getTypeBlockRange(node, lines);
                    if (range) {
                        ranges.push(range);
                    }
                }
            }

            ranges.push(...this.collectBlockCommentRanges(lines, token));
            ranges.push(...this.collectParenthesisRanges(lines, token));
            ranges.push(...this.collectBracketRanges(lines, token));

            return ranges;
        } catch (error) {
            this.errorHandler.handleError(error, {
                component: 'ThriftFoldingRangeProvider',
                operation: 'provideFoldingRanges',
                filePath: document.uri.fsPath
            });
            return [];
        }
    }

    private getTypeBlockRange(node: nodes.ThriftNode, lines: string[]): vscode.FoldingRange | undefined {
        const startLine = node.range.start.line;
        if (startLine >= lines.length) {
            return undefined;
        }
        const endLine = Math.min(lines.length - 1, node.range.end.line - 1);
        if (endLine <= startLine) {
            return undefined;
        }
        let foldEnd = endLine;
        const closingLine = lines[endLine] || '';
        if (closingLine.trim().startsWith('}')) {
            foldEnd = endLine - 1;
        }
        if (foldEnd <= startLine) {
            return undefined;
        }
        return new vscode.FoldingRange(startLine, foldEnd);
    }

    private collectBlockCommentRanges(lines: string[], token: vscode.CancellationToken): vscode.FoldingRange[] {
        const ranges: vscode.FoldingRange[] = [];
        let inBlockComment = false;
        let blockStart = -1;

        for (let i = 0; i < lines.length; i++) {
            if (token.isCancellationRequested) {
                break;
            }
            const trimmed = lines[i].trim();
            if (!inBlockComment && trimmed.startsWith('/*')) {
                inBlockComment = true;
                blockStart = i;
                if (trimmed.includes('*/') && !trimmed.startsWith('*/')) {
                    ranges.push(new vscode.FoldingRange(blockStart, i));
                    inBlockComment = false;
                    blockStart = -1;
                }
                continue;
            }
            if (inBlockComment && trimmed.includes('*/')) {
                ranges.push(new vscode.FoldingRange(blockStart, i));
                inBlockComment = false;
                blockStart = -1;

                for (let checkLine = i + 1; checkLine < Math.min(i + 10, lines.length); checkLine++) {
                    const nextLine = lines[checkLine].trim();
                    if (!nextLine || nextLine.startsWith('//')) {
                        continue;
                    }
                    if (/^(struct|union|exception|enum|senum|service)\b/.test(nextLine)) {
                        const structEnd = this.findMatchingBracket(lines, checkLine, '{', '}');
                        if (structEnd > checkLine) {
                            ranges.push(new vscode.FoldingRange(checkLine, structEnd));
                        }
                        break;
                    }
                    break;
                }
            }
        }

        return ranges;
    }

    private collectParenthesisRanges(lines: string[], token: vscode.CancellationToken): vscode.FoldingRange[] {
        const ranges: vscode.FoldingRange[] = [];
        for (let i = 0; i < lines.length; i++) {
            if (token.isCancellationRequested) {
                break;
            }
            const line = lines[i];
            for (let j = 0; j < line.length; j++) {
                if (line[j] === '(' && this.isFunctionContext(lines, i, j)) {
                    const closeParenLine = this.findMatchingParen(lines, i, j);
                    if (closeParenLine > i) {
                        ranges.push(new vscode.FoldingRange(i, closeParenLine));
                    }
                }
            }
        }
        return ranges;
    }

    private collectBracketRanges(lines: string[], token: vscode.CancellationToken): vscode.FoldingRange[] {
        const ranges: vscode.FoldingRange[] = [];
        for (let i = 0; i < lines.length; i++) {
            if (token.isCancellationRequested) {
                break;
            }
            const trimmed = lines[i].trim();
            if (trimmed.includes('[')) {
                const listEnd = this.findMatchingBracket(lines, i, '[', ']');
                if (listEnd > i) {
                    ranges.push(new vscode.FoldingRange(i, listEnd));
                }
            }

            const hasOpeningBrace = trimmed.includes('{');
            const hasClosingBrace = trimmed.includes('}');
            const isTypeDefinition = this.isTypeBlock(lines, i);
            if (hasOpeningBrace && !hasClosingBrace && !isTypeDefinition) {
                const mapEnd = this.findMatchingBracket(lines, i, '{', '}');
                if (mapEnd > i) {
                    ranges.push(new vscode.FoldingRange(i, mapEnd));
                }
            }
        }
        return ranges;
    }

    private isFunctionContext(lines: string[], lineIndex: number, charIndex: number): boolean {
        const line = lines[lineIndex];
        const beforeParen = line.substring(0, charIndex);
        return /\b[A-Za-z_][A-Za-z0-9_]*\s+\w+\s*$/.test(beforeParen) ||
            /\bthrows\s*$/.test(beforeParen) ||
            /\b(oneway\s+)?[A-Za-z_][A-Za-z0-9_<>.,\s]+\s+\w+\s*$/.test(beforeParen);
    }

    private isTypeBlock(lines: string[], lineIndex: number): boolean {
        const line = lines[lineIndex].trim();
        if (line.match(/^(struct|union|exception|enum|senum|service)\b/)) {
            return true;
        }
        for (let i = Math.max(0, lineIndex - 3); i < lineIndex; i++) {
            const prevLine = lines[i].trim();
            if (prevLine.match(/^(struct|union|exception|enum|senum|service)\b/)) {
                return true;
            }
        }
        return false;
    }

    private findMatchingBracket(lines: string[], startLine: number, open: string, close: string): number {
        let depth = 0;
        for (let i = startLine; i < lines.length; i++) {
            const line = lines[i];
            for (let j = 0; j < line.length; j++) {
                if (line[j] === open) {
                    depth++;
                } else if (line[j] === close) {
                    depth--;
                    if (depth === 0) {
                        return i;
                    }
                }
            }
        }
        return -1;
    }

    private findMatchingParen(lines: string[], startLine: number, startChar: number): number {
        let depth = 0;
        for (let i = startLine; i < lines.length; i++) {
            const line = lines[i];
            for (let j = i === startLine ? startChar : 0; j < line.length; j++) {
                if (line[j] === '(') {
                    depth++;
                } else if (line[j] === ')') {
                    depth--;
                    if (depth === 0) {
                        return i;
                    }
                }
            }
        }
        return -1;
    }
}

/**
 * 注册 FoldingRangeProvider。
 */
export function registerFoldingRangeProvider(context: vscode.ExtensionContext, deps?: Partial<CoreDependencies>) {
    const provider = new ThriftFoldingRangeProvider(deps);
    const disposable = vscode.languages.registerFoldingRangeProvider('thrift', provider);
    context.subscriptions.push(disposable);
}
