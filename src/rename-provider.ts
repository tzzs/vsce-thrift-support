import * as vscode from 'vscode';
import {ThriftReferencesProvider} from './references-provider';
import {ErrorHandler} from './utils/error-handler';
import {CoreDependencies} from './utils/dependencies';

/**
 * ThriftRenameProvider：处理 Thrift 文件的符号重命名。
 */
export class ThriftRenameProvider implements vscode.RenameProvider {
    private errorHandler: ErrorHandler;

    constructor(deps?: Partial<CoreDependencies>) {
        this.errorHandler = deps?.errorHandler ?? ErrorHandler.getInstance();
    }
    /**
     * 预检查重命名位置，返回可重命名范围与占位符。
     */
    prepareRename(document: vscode.TextDocument, position: vscode.Position, _token: vscode.CancellationToken): vscode.ProviderResult<vscode.Range | {
        range: vscode.Range;
        placeholder: string;
    }> {
        try {
            const wordRange = this.getWordRange(document, position);
            if (!wordRange) {
                return Promise.reject('No symbol to rename at cursor');
            }
            const placeholder = document.getText(wordRange);
            return {range: wordRange, placeholder};
        } catch (error) {
            this.errorHandler.handleError(error, {
                component: 'ThriftRenameProvider',
                operation: 'prepareRename',
                filePath: document.uri.fsPath,
                additionalInfo: { position: position.toString() }
            });
            return Promise.reject('Rename failed');
        }
    }

    /**
     * 生成重命名的 WorkspaceEdit，尽量使用精确范围替换。
     */
    async provideRenameEdits(document: vscode.TextDocument, position: vscode.Position, newName: string, _token: vscode.CancellationToken): Promise<vscode.WorkspaceEdit | undefined> {
        try {
            const wordRange = this.getWordRange(document, position);
            if (!wordRange) {
                return undefined;
            }
            const oldName = document.getText(wordRange);
            if (!oldName || oldName === newName) {
                return undefined;
            }

            // Use the references provider to find all occurrences
            const referencesProvider = new ThriftReferencesProvider();
            const safeToken = _token ?? ({ isCancellationRequested: false } as vscode.CancellationToken);
            const references = await referencesProvider.provideReferences(
                document,
                position,
                {includeDeclaration: true},
                safeToken
            );

            if (!references || references.length === 0) {
                return undefined;
            }

            const edit = new vscode.WorkspaceEdit();
            const documentCache = new Map<string, vscode.TextDocument>();

            // Apply edits for all references
            for (const reference of references) {
                const targetDoc = await this.getDocumentForUri(reference.uri, document, documentCache);
                if (!targetDoc) {
                    continue;
                }
                const ranges = this.getReplacementRanges(targetDoc, reference.range, oldName);
                for (const range of ranges) {
                    edit.replace(
                        reference.uri,
                        range,
                        newName
                    );
                }
            }

            return edit;
        } catch (error) {
            this.errorHandler.handleError(error, {
                component: 'ThriftRenameProvider',
                operation: 'provideRenameEdits',
                filePath: document.uri.fsPath,
                additionalInfo: { position: position.toString(), newName }
            });
            return undefined;
        }
    }

    /**
     * 获取当前位置的标识符范围。
     */
    private getWordRange(document: vscode.TextDocument, position: vscode.Position): vscode.Range | undefined {
        const defaultWordPattern = /[A-Za-z_][A-Za-z0-9_]*/g;
        const line = document.lineAt(position.line).text;
        let match: RegExpExecArray | null;
        while ((match = defaultWordPattern.exec(line)) !== null) {
            const start = match.index;
            const end = start + match[0].length;
            if (position.character >= start && position.character <= end) {
                return new vscode.Range(new vscode.Position(position.line, start), new vscode.Position(position.line, end));
            }
        }
        return undefined;
    }

    /**
     * 获取可稳定比对的 URI 键。
     */
    private getUriKey(uri: vscode.Uri): string {
        const uriAny = uri as unknown as { fsPath?: string; path?: string; toString?: () => string };
        return uriAny.fsPath || uriAny.path || (uriAny.toString ? uriAny.toString() : '');
    }

    /**
     * 获取指定 URI 的文档实例（含缓存）。
     */
    private async getDocumentForUri(
        uri: vscode.Uri,
        fallback: vscode.TextDocument,
        cache: Map<string, vscode.TextDocument>
    ): Promise<vscode.TextDocument | undefined> {
        const key = this.getUriKey(uri);
        const fallbackKey = this.getUriKey(fallback.uri as vscode.Uri);
        if (key && key === fallbackKey) {
            return fallback;
        }
        if (cache.has(key)) {
            return cache.get(key);
        }
        if (!vscode.workspace?.openTextDocument) {
            return undefined;
        }
        try {
            const doc = await vscode.workspace.openTextDocument(uri);
            cache.set(key, doc);
            return doc;
        } catch {
            this.errorHandler.handleWarning('Failed to open document for rename', {
                component: 'ThriftRenameProvider',
                operation: 'getDocumentForUri',
                filePath: this.getUriKey(uri)
            });
            return undefined;
        }
    }

    /**
     * 计算精确的替换范围，避免误替换整段。
     */
    private getReplacementRanges(document: vscode.TextDocument, referenceRange: vscode.Range, oldName: string): vscode.Range[] {
        if (!referenceRange) {
            return [];
        }
        const sameLine = referenceRange.start.line === referenceRange.end.line;
        const lineText = document.lineAt(referenceRange.start.line).text;
        const searchStart = sameLine ? referenceRange.start.character : 0;
        const commentIndex = lineText.indexOf('//');
        const lineEnd = sameLine ? referenceRange.end.character : lineText.length;
        const searchEnd = commentIndex !== -1 ? Math.min(lineEnd, commentIndex) : lineEnd;

        const ranges = this.findWordRangesInLine(
            lineText,
            referenceRange.start.line,
            oldName,
            searchStart,
            searchEnd
        );
        if (ranges.length > 0) {
            return ranges;
        }

        const exactText = document.getText(referenceRange);
        if (exactText === oldName) {
            return [referenceRange];
        }

        const escaped = this.escapeRegExp(oldName);
        const fallbackRange = document.getWordRangeAtPosition(
            referenceRange.start,
            new RegExp(`\\b${escaped}\\b`, 'g')
        );
        return fallbackRange ? [fallbackRange] : [];
    }

    /**
     * 在指定行内查找匹配单词的范围集合。
     */
    private findWordRangesInLine(
        lineText: string,
        line: number,
        word: string,
        startChar: number,
        endChar: number
    ): vscode.Range[] {
        const ranges: vscode.Range[] = [];
        if (!word) {
            return ranges;
        }
        const escaped = this.escapeRegExp(word);
        const regex = new RegExp(`\\b${escaped}\\b`, 'g');
        let match: RegExpExecArray | null;
        while ((match = regex.exec(lineText)) !== null) {
            const start = match.index;
            const end = start + match[0].length;
            if (start >= startChar && end <= endChar) {
                ranges.push(
                    new vscode.Range(
                        new vscode.Position(line, start),
                        new vscode.Position(line, end)
                    )
                );
            }
        }
        return ranges;
    }

    /**
     * 转义正则特殊字符。
     */
    private escapeRegExp(value: string): string {
        return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
}
