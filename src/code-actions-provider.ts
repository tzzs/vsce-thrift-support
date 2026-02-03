/**
 * Code Action Provider for Thrift refactorings and quick fixes
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { readThriftFile } from './utils/file-reader';
import { ThriftParser } from './ast/parser';
import * as nodes from './ast/nodes.types';
import { collectIncludes, collectTopLevelTypes } from './ast/utils';
import { config } from './config';
import { ErrorHandler } from './utils/error-handler';
import { CoreDependencies } from './utils/dependencies';

/**
 * ThriftRefactorCodeActionProvider：提供重构与 Quick Fix。
 */
export class ThriftRefactorCodeActionProvider implements vscode.CodeActionProvider {
    static readonly providedCodeActionKinds = [
        vscode.CodeActionKind.Refactor,
        vscode.CodeActionKind.RefactorExtract,
        vscode.CodeActionKind.RefactorMove,
        vscode.CodeActionKind.QuickFix,
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
        if (document.languageId !== 'thrift') {
            return;
        }

        try {
            const actions: vscode.CodeAction[] = [];

            // Extract type (typedef) from selection or current token
            const extract = new vscode.CodeAction('Extract type (typedef)', vscode.CodeActionKind.RefactorExtract);
            extract.command = { command: 'thrift.refactor.extractType', title: 'Extract type (typedef)' };
            actions.push(extract);

            // Move type to another file (struct/enum/service/typedef)
            const move = new vscode.CodeAction('Move type to file...', vscode.CodeActionKind.RefactorMove);
            move.command = { command: 'thrift.refactor.moveType', title: 'Move type to file...' };
            actions.push(move);

            const position = (range as vscode.Selection).active ?? range.start;
            const lineText = document.lineAt(position.line).text;

            // 1) QuickFix: insert include for namespaced reference Foo.Bar when missing
            const nsRegex = /\b([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)\b/g;
            const includeSet = this.collectExistingIncludes(document);
            const createdNs = new Set<string>();
            const nsMatches = Array.from(lineText.matchAll(nsRegex));
            for (const m of nsMatches) {
                const ns = m[1];
                const fileName = `${ns}.thrift`;
                if (!includeSet.has(fileName) && !createdNs.has(ns)) {
                    try {
                        // Only propose when the target include file actually exists in the workspace
                        const files = await vscode.workspace.findFiles(
                            `**/${fileName}`,
                            undefined,
                            config.search.includeFileLimit,
                            token
                        );
                        if (files && files.length > 0) {
                            const fix = new vscode.CodeAction(`Insert include "${fileName}"`, vscode.CodeActionKind.QuickFix);
                            fix.edit = new vscode.WorkspaceEdit();
                            const insertLine = this.computeIncludeInsertLine(document);
                            fix.edit.insert(document.uri, new vscode.Position(insertLine, 0), `include "${fileName}"\n`);
                            fix.isPreferred = true;
                            actions.push(fix);
                            createdNs.add(ns);
                        }
                    } catch {
                        this.errorHandler.handleWarning('Include search failed', {
                            component: 'ThriftRefactorCodeActionProvider',
                            operation: 'provideCodeActions',
                            filePath: document.uri.fsPath,
                            additionalInfo: { fileName }
                        });
                    }
                }
            }

            // 2) QuickFix: for unqualified identifier provide include choices when multiple workspace definitions exist
            const wordRange = document.getWordRangeAtPosition(position, /[A-Za-z_][A-Za-z0-9_]*/);
            if (wordRange) {
                const word = document.getText(wordRange);
                if (word && !lineText.includes(`${word}.`)) {
                    try {
                        const candidates = await this.findWorkspaceDefinitions(word);
                        // Create include actions per unique file
                        const uniqueFiles = new Map<string, { fileName: string, uri: vscode.Uri }>();
                        for (const c of candidates) {
                            const fname = path.basename(c.uri.fsPath);
                            uniqueFiles.set(fname, { fileName: fname, uri: c.uri });
                        }
                        for (const { fileName } of uniqueFiles.values()) {
                            if (!includeSet.has(fileName)) {
                                const fix = new vscode.CodeAction(`Insert include "${fileName}"`, vscode.CodeActionKind.QuickFix);
                                fix.edit = new vscode.WorkspaceEdit();
                                const insertLine = this.computeIncludeInsertLine(document);
                                fix.edit.insert(document.uri, new vscode.Position(insertLine, 0), `include "${fileName}"\n`);
                                actions.push(fix);
                            }
                        }
                    } catch {
                        this.errorHandler.handleWarning('Definition search failed', {
                            component: 'ThriftRefactorCodeActionProvider',
                            operation: 'provideCodeActions',
                            filePath: document.uri.fsPath,
                            additionalInfo: { word }
                        });
                    }
                }
            }

            return actions;
        } catch (error) {
            this.errorHandler.handleError(error, {
                component: 'ThriftRefactorCodeActionProvider',
                operation: 'provideCodeActions',
                filePath: document.uri.fsPath
            });
            return [];
        }
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
        const uri = (document as vscode.TextDocument).uri;
        if (uri && typeof uri.toString === 'function') {
            return ThriftParser.parseWithCache(document);
        }
        const parser = new ThriftParser(document.getText());
        return parser.parse();
    }

    private async findWorkspaceDefinitions(typeName: string): Promise<Array<{ uri: vscode.Uri }>> {
        const results: Array<{ uri: vscode.Uri }> = [];
        const files = await vscode.workspace.findFiles(config.filePatterns.thrift);
        for (const file of files) {
            try {
                const text = await readThriftFile(file);
                const ast = ThriftParser.parseContentWithCache(file.toString(), text);
                const hasType = collectTopLevelTypes(ast).some(node =>
                    node.name === typeName &&
                    (node.type === nodes.ThriftNodeType.Struct ||
                        node.type === nodes.ThriftNodeType.Union ||
                        node.type === nodes.ThriftNodeType.Exception ||
                        node.type === nodes.ThriftNodeType.Enum ||
                        node.type === nodes.ThriftNodeType.Service ||
                        node.type === nodes.ThriftNodeType.Typedef)
                );
                if (hasType) {
                    results.push({ uri: file });
                }
            } catch {
                this.errorHandler.handleWarning('Workspace type scan failed', {
                    component: 'ThriftRefactorCodeActionProvider',
                    operation: 'findWorkspaceDefinitions',
                    filePath: file.fsPath,
                    additionalInfo: { typeName }
                });
            }
        }
        return results;
    }
}
