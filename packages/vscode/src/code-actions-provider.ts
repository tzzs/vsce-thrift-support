/**
 * Code Action Provider for Thrift refactorings and quick fixes
 */

import * as path from 'path';
import * as vscode from 'vscode';
import {readThriftFile} from './utils/file-reader';
import {ThriftParser} from '@tanzz/thrift-core';
import {nodes} from '@tanzz/thrift-core';
import {collectIncludes, collectTopLevelTypes, parseContainerTypeInfo} from '@tanzz/thrift-core';
import {config} from '@tanzz/thrift-core';
import {ErrorHandler} from '@tanzz/thrift-core';
import {CoreDependencies} from './utils/dependencies';

/**
 * ThriftRefactorCodeActionProvider：提供重构与 Quick Fix。
 */
export class ThriftRefactorCodeActionProvider {
    static readonly providedCodeActionKinds = [
        vscode.CodeActionKind.Refactor,
        vscode.CodeActionKind.RefactorExtract,
        vscode.CodeActionKind.QuickFix
    ];
    private errorHandler: ErrorHandler;

    constructor(deps?: Partial<CoreDependencies>) {
        this.errorHandler = deps?.errorHandler ?? new ErrorHandler();
    }

    /**
     * 返回当前上下文下的 CodeAction 列表。
     */
    async provideCodeActions(
        document: vscode.TextDocument,
        range: vscode.Range | vscode.Selection,
        context: vscode.CodeActionContext,
        token: vscode.CancellationToken
    ): Promise<vscode.CodeAction[] | undefined> {
        try {
            if (document.languageId !== 'thrift' || (typeof token !== 'undefined' && token.isCancellationRequested)) {
                return undefined;
            }

            const actions: vscode.CodeAction[] = [];

            // Extract type (typedef) from selection or current token
            const extract = new vscode.CodeAction('Extract type (typedef)', vscode.CodeActionKind.RefactorExtract);
            extract.command = {command: 'thrift.refactor.extractType', title: 'Extract type (typedef)'};
            actions.push(extract);

            // Move type to another file (struct/enum/service/typedef)
            // Using 'refactor.move' string with type assertion because VS Code API doesn't have RefactorMove constant
            // but the extension needs this specific kind for proper categorization in the UI
            const move = new vscode.CodeAction('Move type to file...', 'refactor.move' as unknown as vscode.CodeActionKind);
            move.command = {command: 'thrift.refactor.moveType', title: 'Move type to file...'};
            actions.push(move);

            // QuickFix is gated on diagnostics: only offer "insert include" for types that
            // the diagnostics layer flagged as unknown (code 'type.unknown') and whose range
            // overlaps the requested range. This keeps the lightbulb in sync with the squiggly.
            const unknownTypes = this.collectUnknownTypeTargets(document, range, context);
            if (unknownTypes.size === 0 || (typeof token !== 'undefined' && token.isCancellationRequested)) {
                return actions;
            }

            // Scan workspace once for all unknown types (avoids N × files overhead)
            const workspaceTypeMap = await this.buildWorkspaceTypeMap(token);
            if (typeof token !== 'undefined' && token.isCancellationRequested) {
                return actions;
            }

            const includeSet = this.collectExistingIncludes(document);
            const insertLine = this.computeIncludeInsertLine(document);
            for (const [typeName, diagnostic] of unknownTypes) {
                if (typeof token !== 'undefined' && token.isCancellationRequested) {
                    break;
                }
                const definitions = workspaceTypeMap.get(typeName) ?? [];
                for (const defUri of definitions) {
                    if (typeof token !== 'undefined' && token.isCancellationRequested) {
                        break;
                    }
                    if (defUri.toString() === document.uri.toString()) {
                        continue;
                    }
                    const includePath = this.computeRelativeIncludePath(document.uri, defUri);
                    if (includePath === undefined || includePath === '' || includeSet.has(includePath)) {
                        continue;
                    }
                    const fix = new vscode.CodeAction(`Insert include "${includePath}"`, vscode.CodeActionKind.QuickFix);
                    fix.edit = new vscode.WorkspaceEdit();
                    fix.edit.insert(document.uri, new vscode.Position(insertLine, 0), `include "${includePath}"\n`);
                    fix.diagnostics = [diagnostic];
                    fix.isPreferred = unknownTypes.size === 1 && definitions.length === 1;
                    actions.push(fix);
                    includeSet.add(includePath);
                }
            }

            return actions;
        } catch (error) {
            this.errorHandler.handleWarning('CodeActionProvider failed', {
                component: 'ThriftRefactorCodeActionProvider',
                operation: 'provideCodeActions',
                filePath: document.uri?.toString(),
                additionalInfo: {error: error instanceof Error ? error.message : 'Unknown error'}
            });
            return [];
        }
    }

    private static readonly NON_TYPE_TOKENS = new Set([
        'list', 'set', 'map', 'string', 'binary', 'bool', 'byte',
        'i8', 'i16', 'i32', 'i64', 'double', 'void', 'uuid', 'slist',
        'optional', 'required'
    ]);

    private static readonly UNKNOWN_TYPE_CODES = new Set([
        'type.unknown',
        'service.returnType.unknown',
        'service.throws.unknown',
        'typedef.unknownBase'
    ]);

    /**
     * 从 context.diagnostics 中提取与请求范围重叠的「未知类型」名称，
     * 返回 类型名 → 触发诊断 的映射（用于把 Quick Fix 关联回问题）。
     */
    private collectUnknownTypeTargets(
        document: vscode.TextDocument,
        range: vscode.Range | vscode.Selection,
        context: vscode.CodeActionContext
    ): Map<string, vscode.Diagnostic> {
        const targets = new Map<string, vscode.Diagnostic>();
        const diagnostics = context?.diagnostics ?? [];
        for (const diagnostic of diagnostics) {
            const code = typeof diagnostic.code === 'object' && diagnostic.code !== null
                ? String((diagnostic.code as {value: string | number}).value)
                : String(diagnostic.code ?? '');
            if (!ThriftRefactorCodeActionProvider.UNKNOWN_TYPE_CODES.has(code)) {
                continue;
            }
            if (!this.rangesOverlap(diagnostic.range, range)) {
                continue;
            }
            let text = '';
            try {
                text = document.getText(diagnostic.range);
            } catch {
                continue;
            }
            for (const name of this.extractTypeNames(text)) {
                if (!targets.has(name)) {
                    targets.set(name, diagnostic);
                }
            }
        }
        return targets;
    }

    /**
     * 从类型表达式文本（如 `Bar` / `ns.Bar` / `list<Bar>`）中抽取候选类型名，
     * 过滤掉容器关键字与基本类型，并跳过命名空间别名（紧跟 `.` 的标识符）。
     * 使用 angle-bracket 深度追踪替代正则处理嵌套泛型。
     */
    private extractTypeNames(text: string): string[] {
        const names: string[] = [];
        const seen = new Set<string>();
        const collectNames = (typeExpr: string): void => {
            const cleaned = typeExpr.trim();
            if (cleaned.length === 0) { return; }
            const info = parseContainerTypeInfo(cleaned);
            if (info !== null) {
                for (const arg of info.typeArgs) {
                    collectNames(arg);
                }
                return;
            }
            // Plain type reference: extract the last dot-separated part
            const parts = cleaned.split('.');
            const name = parts[parts.length - 1].trim();
            if (name.length > 0 &&
                !ThriftRefactorCodeActionProvider.NON_TYPE_TOKENS.has(name) &&
                !seen.has(name)) {
                seen.add(name);
                names.push(name);
            }
        };
        collectNames(text);
        return names;
    }

    /**
     * 判断诊断范围与请求范围是否重叠（mock 与真实 vscode.Range 均无需 intersection）。
     */
    private rangesOverlap(a: vscode.Range, b: vscode.Range | vscode.Selection): boolean {
        const before = (p: vscode.Position, q: vscode.Position): boolean =>
            p.line < q.line || (p.line === q.line && p.character <= q.character);
        return before(a.start, b.end) && before(b.start, a.end);
    }

    /**
     * 计算 targetUri 相对当前文档目录的 include 路径，统一为正斜杠。
     */
    private computeRelativeIncludePath(documentUri: vscode.Uri, targetUri: vscode.Uri): string | undefined {
        const fromPath = documentUri?.fsPath;
        const toPath = targetUri?.fsPath;
        if (!fromPath || !toPath) {
            return undefined;
        }
        const relative = path.relative(path.dirname(fromPath), toPath);
        if (!relative) {
            return undefined;
        }
        return relative.split(path.sep).join('/');
    }

    private collectExistingIncludes(document: vscode.TextDocument): Set<string> {
        const set = new Set<string>();
        const ast = this.getDocumentAst(document);
        for (const includeNode of collectIncludes(ast)) {
            set.add(includeNode.path);
        }
        return set;
    }

    private computeIncludeInsertLine(document: vscode.TextDocument): number {
        const ast = this.getDocumentAst(document);
        let insertLine = 0;
        for (const node of ast.body) {
            if (node.type === nodes.ThriftNodeType.Include || node.type === nodes.ThriftNodeType.Namespace) {
                insertLine = Math.max(insertLine, node.range.end.line + 1);
            }
        }
        return insertLine;
    }

    private getDocumentAst(document: vscode.TextDocument): nodes.ThriftDocument {
        const uri = (document ).uri;
        if (typeof uri !== 'undefined' && typeof uri.toString === 'function') {
            return ThriftParser.parseWithCacheByVersion(document.uri.fsPath, document.getText(), document.version);
        }
        const parser = new ThriftParser(document.getText());
        return parser.parse();
    }

    /**
     * Scan all workspace .thrift files once and build a map of type name → defining URIs.
     * Passes the cancellation token to findFiles so cancelled requests abort early.
     */
    private async buildWorkspaceTypeMap(
        token?: vscode.CancellationToken
    ): Promise<Map<string, vscode.Uri[]>> {
        const typeMap = new Map<string, vscode.Uri[]>();
        const files = await vscode.workspace.findFiles(
            config.filePatterns.thrift, undefined, undefined, token
        );
        for (const file of files) {
            if (typeof token !== 'undefined' && token.isCancellationRequested) {
                break;
            }
            try {
                const text = await readThriftFile(file);
                const ast = ThriftParser.parseContentWithCache(file.toString(), text);
                for (const node of collectTopLevelTypes(ast)) {
                    if (node.name === undefined || node.name === '') { continue; }
                    if (node.type === nodes.ThriftNodeType.Struct ||
                        node.type === nodes.ThriftNodeType.Union ||
                        node.type === nodes.ThriftNodeType.Exception ||
                        node.type === nodes.ThriftNodeType.Enum ||
                        node.type === nodes.ThriftNodeType.Service ||
                        node.type === nodes.ThriftNodeType.Typedef) {
                        let uris = typeMap.get(node.name);
                        if (!uris) {
                            uris = [];
                            typeMap.set(node.name, uris);
                        }
                        uris.push(file);
                    }
                }
            } catch {
                this.errorHandler.handleWarning('Workspace type scan failed', {
                    component: 'ThriftRefactorCodeActionProvider',
                    operation: 'buildWorkspaceTypeMap',
                    filePath: file.fsPath
                });
            }
        }
        return typeMap;
    }
}
