import * as vscode from 'vscode';
import { ThriftParser } from '../ast/parser';
import * as nodes from '../ast/nodes.types';
import { ErrorHandler } from '../utils/error-handler';
import { CoreDependencies } from '../utils/dependencies';
import {
    KEYWORDS,
    NAMESPACE_LANGUAGES,
    COMMON_METHODS,
    addTypeCompletions,
    addEnumValueCompletions,
    provideIncludePathCompletions
} from './items';
import {
    collectTypesAndValues,
    findBlockNode,
    isInEnumAssignmentContext,
    isInMethodContext,
    looksLikeTypeContext
} from './context';

/**
 * ThriftCompletionProvider：提供 Thrift 语言代码补全。
 */
export class ThriftCompletionProvider implements vscode.CompletionItemProvider {
    // 错误处理器
    private errorHandler: ErrorHandler;

    constructor(deps?: Partial<CoreDependencies>) {
        this.errorHandler = deps?.errorHandler ?? new ErrorHandler();
    }

    /**
     * 根据上下文返回补全项列表。
     * @param document 当前文档
     * @param position 光标位置
     * @param token 取消令牌
     * @param _context 补全上下文
     * @returns 补全项列表或 List
     */
    public async provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken,
        _context: vscode.CompletionContext
    ): Promise<vscode.CompletionItem[] | vscode.CompletionList> {
        const thriftDoc = ThriftParser.parseWithCache(document);
        if (token.isCancellationRequested) {
            return [];
        }
        const completions: vscode.CompletionItem[] = [];

        // Determine context using AST
        const line = document.lineAt(position.line).text;
        const beforeCursor = line.substring(0, position.character);

        // 1. Include paths
        if (/^\s*include\s+["']?[^"']*$/.test(line)) {
            // Check if we are inside quotes
            const quoteMatch = beforeCursor.match(/include\s+(["'])/);
            if (quoteMatch) {
                const prefix = beforeCursor.substring(beforeCursor.indexOf(quoteMatch[1]) + 1);
                // Call item helper (note: prefix arg not really used in original implementation logic but passed for potential filtering)
                const items = await provideIncludePathCompletions(document, this.errorHandler);
                return items;
            }
        }

        // 2. Namespace languages
        if (/^\s*namespace\s+\w*$/.test(line)) {
            NAMESPACE_LANGUAGES.forEach((keyword) => {
                const item = new vscode.CompletionItem(keyword, vscode.CompletionItemKind.Keyword);
                item.detail = 'Namespace language';
                completions.push(item);
            });
            return completions;
        }

        // Collect available types and values from AST
        const { types, values } = collectTypesAndValues(thriftDoc);

        // 3. Inside a block (struct, enum, service)
        const blockNode = findBlockNode(thriftDoc, position.line);

        if (blockNode) {
            if (blockNode.type === nodes.ThriftNodeType.Enum) {
                // Inside Enum
            } else if (nodes.isServiceNode(blockNode)) {
                // Inside Service: expecting methods
                if (isInMethodContext(line, position.character)) {
                    COMMON_METHODS.forEach((method) => {
                        const item = new vscode.CompletionItem(
                            method,
                            vscode.CompletionItemKind.Method
                        );
                        completions.push(item);
                    });

                    // Also types for return type
                    addTypeCompletions(completions, types);
                }
            } else {
                // Struct/Union/Exception contexts

                // Heuristic: check if we match "ID :"
                if (
                    /^\s*\d+\s*:\s*$/.test(beforeCursor) ||
                    /^\s*\d+\s*:\s*(required|optional)\s+$/.test(beforeCursor)
                ) {
                    addTypeCompletions(completions, types);
                }

                // If we are typing 'required'/'optional'
                if (/^\s*\d+\s*:\s*\w*$/.test(beforeCursor) && !beforeCursor.trim().endsWith(':')) {
                    if (!nodes.isServiceNode(blockNode)) {
                        ['required', 'optional'].forEach((k) => {
                            completions.push(
                                new vscode.CompletionItem(k, vscode.CompletionItemKind.Keyword)
                            );
                        });
                    }
                    addTypeCompletions(completions, types);
                }
            }
        } else {
            // Top level: suggest keywords
            KEYWORDS.forEach((k) => {
                completions.push(new vscode.CompletionItem(k, vscode.CompletionItemKind.Keyword));
            });
        }

        // General type completion if it looks like a type context
        if (looksLikeTypeContext(line, position.character)) {
            addTypeCompletions(completions, types);
        }

        // Check for enum value assignment context
        if (isInEnumAssignmentContext(line, position.character, thriftDoc)) {
            addEnumValueCompletions(completions, values);
        }

        return completions;
    }
}
