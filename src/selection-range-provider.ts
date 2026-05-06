import * as vscode from 'vscode';
import {ThriftParser} from './ast/parser';
import * as nodes from './ast/nodes.types';
import {findSmallestNodeAtPosition, nodePathFromLeaf, positionInRange} from './ast/utils';
import {ErrorHandler} from './utils/error-handler';
import {CoreDependencies} from './utils/dependencies';

/**
 * ThriftSelectionRangeProvider：提供语法层级选区扩展。
 */

export class ThriftSelectionRangeProvider implements vscode.SelectionRangeProvider {
    private errorHandler: ErrorHandler;

    constructor(deps?: Partial<CoreDependencies>) {
        this.errorHandler = deps?.errorHandler ?? new ErrorHandler();
    }

    /**
     * 返回每个位置的 SelectionRange 树。
     */
    provideSelectionRanges(
        document: vscode.TextDocument,
        positions: vscode.Position[],
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.SelectionRange[]> {
        const result: vscode.SelectionRange[] = [];

        for (const position of positions) {
            if (token.isCancellationRequested) {
                break;
            }

            try {
                const selectionRange = this.getSelectionRanges(document, position);
                if (selectionRange) {
                    result.push(selectionRange);
                }
            } catch (error) {
                this.errorHandler.handleError(error, {
                    component: 'ThriftSelectionRangeProvider',
                    operation: 'provideSelectionRanges',
                    filePath: document.uri.fsPath,
                    additionalInfo: {position: `${position.line}:${position.character}`}
                });
            }
        }

        return result;
    }

    private getSelectionRanges(document: vscode.TextDocument, position: vscode.Position): vscode.SelectionRange | undefined {
        if (document.getText().trim() === '') {
            return undefined;
        }

        const ast = ThriftParser.parseWithCache(document);
        const smallest = findSmallestNodeAtPosition(ast, position);
        const ranges: vscode.Range[] = [];
        const preferredRange = this.selectPreferredRange(document, smallest, position);
        const wordRange = document.getWordRangeAtPosition(position, /[A-Za-z_][A-Za-z0-9_]*/);
        if (preferredRange) {
            ranges.push(preferredRange);
        } else if (wordRange) {
            ranges.push(wordRange);
        }

        const path = nodePathFromLeaf(smallest);
        for (const node of path) {
            if (node.type === nodes.ThriftNodeType.Document) {
                continue;
            }
            if (!positionInRange(node.range, position)) {
                continue;
            }
            const clampedRange = this.clampRange(document, node.range);
            if (ranges.some(existing => this.sameRange(existing, clampedRange))) {
                continue;
            }
            ranges.push(clampedRange);
        }

        if (ranges.length === 0) {
            return undefined;
        }

        return this.buildSelectionChain(ranges);
    }

    private selectPreferredRange(
        document: vscode.TextDocument,
        node: nodes.ThriftNode | undefined,
        position: vscode.Position
    ): vscode.Range | undefined {
        if (!node) {
            return undefined;
        }
        const line = document.lineAt(node.range.start.line).text;

        if (node.type === nodes.ThriftNodeType.Field) {
            const required = node.requiredness ? node.requiredness : undefined;
            const requiredIndex = required ? line.indexOf(required) : -1;
            const requiredRange = requiredIndex >= 0 && required
                ? new vscode.Range(node.range.start.line, requiredIndex, node.range.start.line, requiredIndex + required.length)
                : undefined;

            const typeIndex = line.indexOf(node.fieldType);
            const typeRange = typeIndex >= 0
                ? new vscode.Range(node.range.start.line, typeIndex, node.range.start.line, typeIndex + node.fieldType.length)
                : undefined;

            const nameIndex = node.name ? line.indexOf(node.name, typeIndex >= 0 ? typeIndex + node.fieldType.length : 0) : -1;
            const nameRange = (node.name && nameIndex >= 0)
                ? new vscode.Range(node.range.start.line, nameIndex, node.range.start.line, nameIndex + node.name.length)
                : undefined;

            if (typeRange) {
                const betweenRequiredAndType = requiredRange
                    ? this.isBetween(position, requiredRange.end, typeRange.start)
                    : false;
                if (this.positionInRangeExclusiveEnd(typeRange, position) || betweenRequiredAndType) {
                    return typeRange;
                }
            }

            if (nameRange) {
                const betweenTypeAndName = typeRange
                    ? this.isBetween(position, typeRange.end, nameRange.start)
                    : false;
                if (positionInRange(nameRange, position) || betweenTypeAndName) {
                    return nameRange;
                }
            }

            if (requiredRange && positionInRange(requiredRange, position)) {
                return requiredRange;
            }
        }

        if (node.type === nodes.ThriftNodeType.Function) {
            const returnIndex = line.indexOf(node.returnType);
            const returnRange = returnIndex >= 0
                ? new vscode.Range(node.range.start.line, returnIndex, node.range.start.line, returnIndex + node.returnType.length)
                : undefined;
            const nameIndex = node.name ? line.indexOf(node.name, returnIndex >= 0 ? returnIndex + node.returnType.length : 0) : -1;
            const nameRange = (node.name && nameIndex >= 0)
                ? new vscode.Range(node.range.start.line, nameIndex, node.range.start.line, nameIndex + node.name.length)
                : undefined;

            if (nameRange) {
                const betweenReturnAndName = returnRange
                    ? this.isBetween(position, returnRange.end, nameRange.start)
                    : false;
                if (positionInRange(nameRange, position) || betweenReturnAndName) {
                    return nameRange;
                }
            }

            if (returnRange && positionInRange(returnRange, position)) {
                return returnRange;
            }
        }

        if (node.type === nodes.ThriftNodeType.Include) {
            const match = line.match(/include\s+["']([^"']+)["']/);
            if (match && match.index !== undefined) {
                const value = match[1];
                const valueIndex = line.indexOf(value, match.index);
                if (valueIndex >= 0) {
                    const valueRange = new vscode.Range(
                        node.range.start.line,
                        valueIndex,
                        node.range.start.line,
                        valueIndex + value.length
                    );
                    if (positionInRange(valueRange, position)) {
                        return valueRange;
                    }
                }
            }
        }

        return undefined;
    }

    private isBetween(position: vscode.Position, start: vscode.Position, end: vscode.Position): boolean {
        if (position.line < start.line || position.line > end.line) {
            return false;
        }
        if (position.line === start.line && position.character < start.character) {
            return false;
        }
        if (position.line === end.line && position.character > end.character) {
            return false;
        }
        return true;
    }

    private positionInRangeExclusiveEnd(range: vscode.Range, position: vscode.Position): boolean {
        if (position.line < range.start.line || position.line > range.end.line) {
            return false;
        }
        if (position.line === range.start.line && position.character < range.start.character) {
            return false;
        }
        if (position.line === range.end.line && position.character >= range.end.character) {
            return false;
        }
        return true;
    }

    private buildSelectionChain(ranges: vscode.Range[]): vscode.SelectionRange | undefined {
        const ordered = ranges.slice().sort((a, b) => {
            const sizeA = (a.end.line - a.start.line) * 100000 + (a.end.character - a.start.character);
            const sizeB = (b.end.line - b.start.line) * 100000 + (b.end.character - b.start.character);
            if (sizeA !== sizeB) {
                return sizeA - sizeB;
            }
            if (a.start.line !== b.start.line) {
                return a.start.line - b.start.line;
            }
            if (a.start.character !== b.start.character) {
                return a.start.character - b.start.character;
            }
            if (a.end.line !== b.end.line) {
                return a.end.line - b.end.line;
            }
            return a.end.character - b.end.character;
        });

        let head: vscode.SelectionRange | undefined;
        let current: vscode.SelectionRange | undefined;
        for (const range of ordered) {
            const selection = new vscode.SelectionRange(range);
            if (!head) {
                head = selection;
            }
            if (current) {
                current.parent = selection;
            }
            current = selection;
        }
        return head;
    }

    private sameRange(a: vscode.Range, b: vscode.Range): boolean {
        return a.start.line === b.start.line &&
            a.start.character === b.start.character &&
            a.end.line === b.end.line &&
            a.end.character === b.end.character;
    }

    private clampRange(document: vscode.TextDocument, range: vscode.Range): vscode.Range {
        const lastLine = typeof document.lineCount === 'number'
            ? Math.max(0, document.lineCount - 1)
            : Math.max(0, document.getText().split('\n').length - 1);
        const startLine = Math.min(range.start.line, lastLine);
        const endLine = Math.min(range.end.line, lastLine);
        const startChar = Math.min(range.start.character, this.getLineLength(document, startLine));
        const endChar = Math.min(range.end.character, this.getLineLength(document, endLine));
        return new vscode.Range(startLine, startChar, endLine, endChar);
    }

    private getLineLength(document: vscode.TextDocument, line: number): number {
        try {
            return document.lineAt(line).text.length;
        } catch {
            return 0;
        }
    }
}

/**
 * 注册 SelectionRangeProvider。
 */
export function registerSelectionRangeProvider(context: vscode.ExtensionContext, deps?: Partial<CoreDependencies>) {
    const provider = new ThriftSelectionRangeProvider(deps);
    const disposable = vscode.languages.registerSelectionRangeProvider('thrift', provider);
    context.subscriptions.push(disposable);
}
