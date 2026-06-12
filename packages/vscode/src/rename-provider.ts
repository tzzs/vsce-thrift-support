import * as vscode from 'vscode';
import {ThriftReferencesProvider} from './references-provider';
import {ErrorHandler, ThriftParser, nodes} from '@tanzz/thrift-core';
import {CoreDependencies} from './utils/dependencies';

const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const PRIMITIVE_TYPES = new Set([
    'bool',
    'byte',
    'double',
    'i8',
    'i16',
    'i32',
    'i64',
    'string',
    'binary',
    'uuid',
    'void'
]);
const RESERVED_KEYWORDS = new Set([
    'async',
    'const',
    'cpp_include',
    'cpp_type',
    'enum',
    'exception',
    'extends',
    'final',
    'include',
    'interaction',
    'list',
    'map',
    'namespace',
    'native',
    'oneway',
    'optional',
    'performs',
    'readonly',
    'reference',
    'required',
    'senum',
    'service',
    'set',
    'sink',
    'stream',
    'struct',
    'throws',
    'typedef',
    'union'
]);

/**
 * ThriftRenameProvider：处理 Thrift 文件的符号重命名。
 */
export class ThriftRenameProvider implements vscode.RenameProvider {
    private errorHandler: ErrorHandler;
    private readonly deps?: Partial<CoreDependencies>;

    constructor(deps?: Partial<CoreDependencies>) {
        this.deps = deps;
        this.errorHandler = deps?.errorHandler ?? new ErrorHandler();
    }

    /**
     * 预检查重命名位置，返回可重命名范围与占位符。
     */
    prepareRename(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): vscode.ProviderResult<vscode.Range | {
        range: vscode.Range;
        placeholder: string;
    }> {
        const wordRange = this.getWordRange(document, position);
        if (!wordRange) {
            return Promise.reject(new Error('No symbol to rename at cursor'));
        }
        const placeholder = document.getText(wordRange);
        const validationError = this.validateIdentifierForRename(placeholder, 'symbol');
        if (validationError !== undefined) {
            return Promise.reject(validationError);
        }

        return this.errorHandler.wrapSync(() => {
            void token;
            return {range: wordRange, placeholder};
        }, {
            component: 'ThriftRenameProvider',
            operation: 'prepareRename',
            filePath: this.getUriKey(document.uri),
            additionalInfo: {position: `${position.line}:${position.character}`}
        });
    }

    /**
     * 生成重命名的 WorkspaceEdit，尽量使用精确范围替换。
     */
    async provideRenameEdits(document: vscode.TextDocument, position: vscode.Position, newName: string, token: vscode.CancellationToken): Promise<vscode.WorkspaceEdit | undefined> {
        const newNameError = this.validateIdentifierForRename(newName, 'new name');
        if (newNameError !== undefined) {
            return Promise.reject(newNameError);
        }
        const conflictError = this.validateRenameConflict(document, position, newName);
        if (conflictError !== undefined) {
            return Promise.reject(conflictError);
        }

        return this.errorHandler.wrapAsync(async () => {
            const wordRange = this.getWordRange(document, position);
            if (!wordRange) {
                return undefined;
            }
            const oldName = document.getText(wordRange);
            if (!oldName || oldName === newName) {
                return undefined;
            }

            // Use the references provider to find all occurrences
            const referencesProvider = new ThriftReferencesProvider(this.deps);
            const safeToken = token ?? ({isCancellationRequested: false} as vscode.CancellationToken);
            const references = await referencesProvider.provideReferences(
                document,
                position,
                {includeDeclaration: true},
                safeToken
            );

            if (references === undefined || references.length === 0) {
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
        }, {
            component: 'ThriftRenameProvider',
            operation: 'provideRenameEdits',
            filePath: this.getUriKey(document.uri),
            additionalInfo: {position: `${position.line}:${position.character}`, newName}
        }, undefined);
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
        const uriAny = uri as unknown as {fsPath?: string; path?: string; toString?: () => string};
        return uriAny.fsPath ?? uriAny.path ?? (uriAny.toString ? uriAny.toString() : '');
    }

    private validateIdentifierForRename(value: string, label: string): Error | undefined {
        if (!IDENTIFIER_PATTERN.test(value)) {
            return new Error(`Invalid Thrift identifier for ${label}: "${value}"`);
        }
        if (PRIMITIVE_TYPES.has(value)) {
            return new Error(`Cannot rename primitive type "${value}"`);
        }
        if (RESERVED_KEYWORDS.has(value)) {
            return new Error(`Cannot rename reserved keyword "${value}"`);
        }
        return undefined;
    }

    private validateRenameConflict(
        document: vscode.TextDocument,
        position: vscode.Position,
        newName: string
    ): Error | undefined {
        let ast: nodes.ThriftDocument;
        try {
            ast = new ThriftParser(document.getText()).parse();
        } catch {
            return undefined;
        }

        const topLevelTarget = ast.body.find(node => this.isNamedRangeHit(node, position));
        if (topLevelTarget !== undefined) {
            const conflict = ast.body.find(node =>
                node !== topLevelTarget &&
                node.name === newName &&
                this.isTopLevelRenameScopeNode(node)
            );
            if (conflict !== undefined) {
                return new Error(`Rename conflicts with existing top-level symbol "${newName}"`);
            }
        }

        const scopedConflict = this.findScopedConflict(ast, position, newName);
        if (scopedConflict !== undefined) {
            return scopedConflict;
        }
        return undefined;
    }

    private findScopedConflict(
        ast: nodes.ThriftDocument,
        position: vscode.Position,
        newName: string
    ): Error | undefined {
        for (const node of ast.body) {
            if (nodes.isStructNode(node)) {
                const target = node.fields.find(field => this.isNamedRangeHit(field, position));
                if (target !== undefined && node.fields.some(field => field !== target && field.name === newName)) {
                    return new Error(`Rename conflicts with existing field "${newName}" in ${node.name ?? 'struct'}`);
                }
            }

            if (nodes.isEnumNode(node)) {
                const target = node.members.find(member => this.isNamedRangeHit(member, position));
                if (target !== undefined && node.members.some(member => member !== target && member.name === newName)) {
                    return new Error(`Rename conflicts with existing enum member "${newName}" in ${node.name ?? 'enum'}`);
                }
            }

            if (nodes.isServiceNode(node) || nodes.isInteractionNode(node)) {
                const methodConflict = this.findFunctionScopeConflict(node, position, newName);
                if (methodConflict !== undefined) {
                    return methodConflict;
                }
            }
        }
        return undefined;
    }

    private findFunctionScopeConflict(
        node: nodes.Service | nodes.Interaction,
        position: vscode.Position,
        newName: string
    ): Error | undefined {
        const target = node.functions.find(fn => this.isNamedRangeHit(fn, position));
        if (target !== undefined && node.functions.some(fn => fn !== target && fn.name === newName)) {
            return new Error(`Rename conflicts with existing function "${newName}" in ${node.name ?? 'service'}`);
        }

        for (const fn of node.functions) {
            const argTarget = fn.arguments.find(arg => this.isNamedRangeHit(arg, position));
            if (argTarget !== undefined && fn.arguments.some(arg => arg !== argTarget && arg.name === newName)) {
                return new Error(`Rename conflicts with existing argument "${newName}" in ${fn.name ?? 'function'}`);
            }

            const throwsTarget = fn.throws.find(field => this.isNamedRangeHit(field, position));
            if (throwsTarget !== undefined && fn.throws.some(field => field !== throwsTarget && field.name === newName)) {
                return new Error(`Rename conflicts with existing throws field "${newName}" in ${fn.name ?? 'function'}`);
            }
        }
        return undefined;
    }

    private isTopLevelRenameScopeNode(node: nodes.ThriftNode): boolean {
        return node.type === nodes.ThriftNodeType.Const ||
            node.type === nodes.ThriftNodeType.Typedef ||
            node.type === nodes.ThriftNodeType.Enum ||
            node.type === nodes.ThriftNodeType.Struct ||
            node.type === nodes.ThriftNodeType.Union ||
            node.type === nodes.ThriftNodeType.Exception ||
            node.type === nodes.ThriftNodeType.Service ||
            node.type === nodes.ThriftNodeType.Interaction;
    }

    private isNamedRangeHit(node: nodes.ThriftNode, position: vscode.Position): boolean {
        if (node.nameRange === undefined) {
            return false;
        }
        return position.line >= node.nameRange.start.line &&
            position.line <= node.nameRange.end.line &&
            (position.line !== node.nameRange.start.line || position.character >= node.nameRange.start.character) &&
            (position.line !== node.nameRange.end.line || position.character <= node.nameRange.end.character);
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
        const fallbackKey = this.getUriKey(fallback.uri);
        if (key && key === fallbackKey) {
            return fallback;
        }
        if (cache.has(key)) {
            return cache.get(key);
        }
        if (vscode.workspace?.openTextDocument === undefined) {
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
        if (referenceRange === undefined) {
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
