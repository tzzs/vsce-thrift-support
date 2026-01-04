import * as vscode from 'vscode';
import {ThriftFormattingProvider} from './formatting-provider';
import {ThriftDefinitionProvider} from './definition-provider';
import {ThriftHoverProvider} from './hover-provider';
import {registerDiagnostics} from './diagnostics';
import {ThriftRenameProvider} from './rename-provider';
import {ThriftRefactorCodeActionProvider} from './code-actions-provider';
import {registerCompletionProvider} from './completion-provider';
import {registerDocumentSymbolProvider} from './document-symbol-provider';
import {registerWorkspaceSymbolProvider} from './workspace-symbol-provider';
import {registerReferencesProvider} from './references-provider';
import {registerFoldingRangeProvider} from './folding-range-provider';
import {registerSelectionRangeProvider} from './selection-range-provider';
import {PerformanceMonitor} from './performance-monitor';
import {ErrorHandler} from './utils/error-handler';
import {createCoreDependencies} from './utils/dependencies';
import {config} from './config';

/**
 * 扩展入口，注册所有能力与命令。
 */
export function activate(context: vscode.ExtensionContext) {
    const deps = createCoreDependencies();
    const errorHandler = deps.errorHandler;
    errorHandler.handleInfo('Thrift Support extension is now active!', {
        component: 'Extension',
        operation: 'activate'
    });

    // Register formatting provider
    const formattingProvider = new ThriftFormattingProvider(deps);
    context.subscriptions.push(
        vscode.languages.registerDocumentFormattingEditProvider('thrift', formattingProvider)
    );
    context.subscriptions.push(
        vscode.languages.registerDocumentRangeFormattingEditProvider('thrift', formattingProvider)
    );
    // Track dirty ranges for incremental formatting/analysis
    const tracker = deps.incrementalTracker;
    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument(event => tracker.markChanges(event))
    );

    // Register definition provider for go-to-definition
    const definitionProvider = new ThriftDefinitionProvider(deps);
    context.subscriptions.push(
        vscode.languages.registerDefinitionProvider('thrift', definitionProvider)
    );

    // 添加文件监听器，当文件改变时清除定义提供器的缓存
    const fileWatcher = deps.fileWatcher;
    const definitionFileWatcher = fileWatcher.createWatcher(config.filePatterns.thrift, () => {
        definitionProvider.clearCache();
    });
    context.subscriptions.push(definitionFileWatcher);

    // Register hover provider for showing symbol documentation on hover
    const hoverProvider = new ThriftHoverProvider(deps);
    context.subscriptions.push(vscode.languages.registerHoverProvider('thrift', hoverProvider));

    // 添加文件监听器，当文件改变时清除悬停提供器的缓存
    const hoverFileWatcher = fileWatcher.createWatcher(config.filePatterns.thrift, () => {
        ThriftHoverProvider.clearCache();
    });
    context.subscriptions.push(hoverFileWatcher);

    // Register diagnostics (syntax/type/duplicate id/unknown type)
    registerDiagnostics(context, deps);

    // Register completion provider for auto-completion
    registerCompletionProvider(context, deps);

    // Register document symbol provider for outline view
    registerDocumentSymbolProvider(context, deps);

    // Register workspace symbol provider for symbol search (Ctrl+T)
    registerWorkspaceSymbolProvider(context, deps);

    // Register references provider for finding references
    registerReferencesProvider(context, deps);

    // Register folding range provider for code folding
    registerFoldingRangeProvider(context, deps);

    // Register selection range provider for smart selection
    registerSelectionRangeProvider(context, deps);

    // Register rename provider
    context.subscriptions.push(
        vscode.languages.registerRenameProvider('thrift', new ThriftRenameProvider(deps))
    );

    // Register code actions provider (extract/move type + quick fixes)
    context.subscriptions.push(
        vscode.languages.registerCodeActionsProvider(
            'thrift',
            new ThriftRefactorCodeActionProvider(deps),
            {
                providedCodeActionKinds: [
                    vscode.CodeActionKind.Refactor,
                    vscode.CodeActionKind.RefactorExtract,
                    vscode.CodeActionKind.RefactorMove,
                    vscode.CodeActionKind.QuickFix
                ]
            }
        )
    );

    // Register formatting commands
    context.subscriptions.push(
        vscode.commands.registerCommand('thrift.format.document', async () => {
            const editor = vscode.window.activeTextEditor;
            if (editor && editor.document.languageId === 'thrift') {
                await vscode.commands.executeCommand('editor.action.formatDocument');
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('thrift.format.selection', async () => {
            const editor = vscode.window.activeTextEditor;
            if (editor && editor.document.languageId === 'thrift') {
                await vscode.commands.executeCommand('editor.action.formatSelection');
            }
        })
    );

    // Refactor: extract type definition
    context.subscriptions.push(
        vscode.commands.registerCommand('thrift.refactor.extractType', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor || editor.document.languageId !== 'thrift') {
                return;
            }
            const doc = editor.document;
            const sel = editor.selection;
            const fullLine = doc.lineAt(sel.active.line).text;
            const selectedText = doc.getText(sel) || undefined;

            // Try to infer type from current line if no selection
            let typeText =
                selectedText && selectedText.trim().length > 0 ? selectedText.trim() : undefined;
            if (!typeText) {
                // match field: 1: required list<string> items,
                const m = fullLine.match(
                    /^(\s*)\d+\s*:\s*(?:required|optional)?\s*([^\s,;]+(?:\s*<[^>]+>)?)\s+([A-Za-z_][A-Za-z0-9_]*)/
                );
                if (m) {
                    typeText = m[2];
                }
            }
            if (!typeText) {
                return;
            }

            const newTypeName = await vscode.window.showInputBox({
                prompt: 'New type name',
                value: 'ExtractedType'
            });
            if (!newTypeName) {
                return;
            }

            const edit = new vscode.WorkspaceEdit();

            // Insert typedef at a suitable location: after last include/namespace or at top
            const text = doc.getText();
            const lines = text.split('\n');
            let insertLine = 0;
            for (let i = 0; i < lines.length; i++) {
                if (/^\s*(include\s+['"].+['"]|namespace\s+)/.test(lines[i])) {
                    insertLine = i + 1;
                }
            }
            const typedefLine = `typedef ${typeText} ${newTypeName}`;
            edit.insert(doc.uri, new vscode.Position(insertLine, 0), typedefLine + '\n\n');

            // Replace original type text at current line if present in the line
            const typeIdx = fullLine.indexOf(typeText);
            if (typeIdx >= 0) {
                const lineNo = sel.active.line;
                edit.replace(
                    doc.uri,
                    new vscode.Range(lineNo, typeIdx, lineNo, typeIdx + typeText.length),
                    newTypeName
                );
            }

            await vscode.workspace.applyEdit(edit);
        })
    );

    // Refactor: move type to another file
    context.subscriptions.push(
        vscode.commands.registerCommand('thrift.refactor.moveType', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor || editor.document.languageId !== 'thrift') {
                return;
            }
            const doc = editor.document;
            const sel = editor.selection;
            const pos = sel.active;

            // Heuristic: find the enclosing type block (struct/enum/service/typedef)
            let startLine = 0;
            let endLine = doc.lineCount - 1;
            for (let i = pos.line; i >= 0; i--) {
                const t = doc.lineAt(i).text;
                if (/^\s*(struct|enum|service|typedef)\s+[A-Za-z_][A-Za-z0-9_]*/.test(t)) {
                    startLine = i;
                    break;
                }
            }
            for (let i = pos.line; i < doc.lineCount; i++) {
                const t = doc.lineAt(i).text;
                if (t.includes('{')) {
                    startLine = Math.min(startLine, i);
                    break;
                }
            }
            for (let i = pos.line; i < doc.lineCount; i++) {
                const t = doc.lineAt(i).text;
                if (t.includes('}')) {
                    endLine = i;
                    break;
                }
            }

            const typeDeclLine = doc.lineAt(startLine).text;
            const m = typeDeclLine.match(
                /^\s*(struct|enum|service|typedef)\s+([A-Za-z_][A-Za-z0-9_]*)/
            );
            if (!m) {
                return;
            }
            const typeKind = m[1];
            const typeName = m[2];

            // If it's a typedef, keep to the declaration line (typedef 无大括号，避免误删后续内容)
            if (typeKind === 'typedef') {
                endLine = startLine;
            } else {
                // Find matching closing brace if not found yet
                if (endLine < startLine) {
                    let depth = 0;
                    for (let i = pos.line; i < doc.lineCount; i++) {
                        const t = doc.lineAt(i).text;
                        if (t.includes('{')) {
                            if (depth === 0) {
                                startLine = i;
                            }
                            depth++;
                        }
                        if (t.includes('}')) {
                            depth--;
                            if (depth === 0) {
                                endLine = i;
                                break;
                            }
                        }
                    }
                }
            }

            const typeBlock = doc.getText(
                new vscode.Range(startLine, 0, endLine, doc.lineAt(endLine).text.length)
            );

            const defaultFileName = `${typeName}.thrift`;
            const targetName = await vscode.window.showInputBox({
                prompt: 'Target .thrift file name',
                value: defaultFileName
            });
            if (!targetName) {
                return;
            }

            const folder = vscode.Uri.file(require('path').dirname(doc.uri.fsPath));
            const targetUri = vscode.Uri.file(require('path').join(folder.fsPath, targetName));

            const edit = new vscode.WorkspaceEdit();
            // Guard: avoid silently overwriting an existing file
            try {
                await vscode.workspace.fs.stat(targetUri);
                vscode.window.showWarningMessage(
                    `Target file "${targetName}" already exists. Move cancelled to avoid overwriting.`
                );
                return;
            } catch {
                // file does not exist, safe to proceed
            }
            // Ensure include line exists
            const includeLine = `include "${targetName}"`;
            const docText = doc.getText();
            if (!new RegExp(`^\\s*include\\s+[\"\']${targetName}[\"\']`, 'm').test(docText)) {
                edit.insert(doc.uri, new vscode.Position(0, 0), includeLine + '\n');
            }
            // Remove original block
            edit.delete(doc.uri, new vscode.Range(startLine, 0, endLine + 1, 0));
            // Create new file and insert block
            edit.createFile(targetUri, {overwrite: true});
            edit.insert(targetUri, new vscode.Position(0, 0), typeBlock + '\n');

            await vscode.workspace.applyEdit(edit);
        })
    );

    // Register performance monitoring commands
    context.subscriptions.push(
        vscode.commands.registerCommand('thrift.showPerformanceReport', () => {
            PerformanceMonitor.showPerformanceReport();
        })
    );

    // Add command to clear performance data
    context.subscriptions.push(
        vscode.commands.registerCommand('thrift.clearPerformanceData', () => {
            PerformanceMonitor.clearMetrics();
            vscode.window.showInformationMessage('Thrift Support: Performance metrics cleared');
        })
    );
}

export function deactivate() {
    const errorHandler = ErrorHandler.getInstance();
    errorHandler.handleInfo('Thrift Support extension is now deactivated!', {
        component: 'Extension',
        operation: 'deactivate'
    });
}
