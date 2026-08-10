import * as vscode from 'vscode';
import {computeFormattingContext} from '@tanzz/thrift-core';
import type {FormattingContext} from '@tanzz/thrift-core';

export type {FormattingContext} from '@tanzz/thrift-core';

/**
 * Compute formatting context from the content before the selection start.
 * @param document - Source document.
 * @param start - Selection start position.
 * @param useCachedAst - Whether to use cached AST for full document.
 * @returns Formatting context for range formatting.
 */
export function computeInitialContext(
    document: vscode.TextDocument,
    start: vscode.Position,
    useCachedAst = false
): FormattingContext {
    try {
        if (useCachedAst) {
            const content = document.getText();
            // 光标位于行首时，上一行才是边界：避免把当前行所在块计入上下文
            const boundaryLine = start.character === 0 ? Math.max(start.line - 1, 0) : start.line;
            return computeFormattingContext(content, boundaryLine, document.uri.toString());
        }
        const before = document.getText(new vscode.Range(new vscode.Position(0, 0), start));
        if (!before) {
            return {indentLevel: 0, inStruct: false, inEnum: false, inService: false, inInteraction: false};
        }
        const baseKey = document.uri !== undefined && typeof document.uri.toString === 'function'
            ? document.uri.toString()
            : 'inmemory://range';
        const boundaryLine = Math.max(0, before.split('\n').length - 1);
        return computeFormattingContext(before, boundaryLine, `${baseKey}#range`);
    } catch {
        return {indentLevel: 0, inStruct: false, inEnum: false, inService: false, inInteraction: false};
    }
}
