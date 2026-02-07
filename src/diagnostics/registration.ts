import * as path from 'path';
import * as vscode from 'vscode';
import {config} from '../config';
import {LineRange} from '../utils/line-range';
import {CoreDependencies} from '../utils/dependencies';
import {ThriftFileWatcher} from '../utils/file-watcher';
import {clearIncludeCaches} from './include-resolver';
import {getDirtyChangeSummary} from './change-detector';
import {DiagnosticManager} from './manager';
import {logDiagnostics} from './logger';

/**
 * 注册诊断能力与文件监听。
 * @param context 扩展上下文
 * @param deps 依赖注入
 * @returns void
 */
export function registerDiagnostics(context: vscode.ExtensionContext, deps?: Partial<CoreDependencies>) {
    const diagnosticManager = new DiagnosticManager(deps?.errorHandler, deps?.performanceMonitor);

    const fileWatcher = deps?.fileWatcher ?? new ThriftFileWatcher();

    const diagnosticsFileWatcher = fileWatcher.createWatcher(config.filePatterns.thrift, () => {
        logDiagnostics('[Diagnostics] File system watcher triggered, clearing caches and rescheduling analysis');

        clearIncludeCaches();

        vscode.workspace.textDocuments.forEach(doc => {
            if (doc.languageId === 'thrift') {
                diagnosticManager.scheduleAnalysis(doc, false, false, 'fileSystemChange');
            }
        });
    });

    context.subscriptions.push(diagnosticsFileWatcher);

    context.subscriptions.push(
        vscode.workspace.onDidOpenTextDocument(doc => {
            if (doc.languageId === 'thrift') {
                diagnosticManager.scheduleAnalysis(doc, true, false, 'documentOpen');
            }
        }),

        vscode.workspace.onDidChangeTextDocument(e => {
            if (e.document.languageId === 'thrift') {
                let dirtyLines: number | undefined;
                let includesMayChange = false;
                let dirtyRange: LineRange | undefined;
                let mergedDirtyRanges: LineRange[] | undefined;
                let structuralChange = false;
                if (config.incremental.analysisEnabled) {
                    const summary = getDirtyChangeSummary(e.document, e.contentChanges);
                    dirtyLines = summary.dirtyLineCount;
                    includesMayChange = summary.includesMayChange;
                    dirtyRange = summary.dirtyRange;
                    mergedDirtyRanges = summary.mergedDirtyRanges;
                    structuralChange = summary.structuralChange;
                }
                diagnosticManager.scheduleAnalysis(
                    e.document,
                    false,
                    false,
                    'documentChange',
                    dirtyLines,
                    includesMayChange,
                    dirtyRange,
                    structuralChange,
                    mergedDirtyRanges
                );
            }
        }),

        vscode.workspace.onDidSaveTextDocument(doc => {
            if (doc.languageId === 'thrift') {
                diagnosticManager.scheduleAnalysis(doc, true, false, 'documentSave');
            }
        }),

        vscode.workspace.onDidCloseTextDocument(doc => {
            if (doc.languageId === 'thrift') {
                diagnosticManager.clearDocument(doc);
            }
        }),

        vscode.window.onDidChangeActiveTextEditor(editor => {
            if (editor && editor.document.languageId === 'thrift') {
                logDiagnostics(`[Diagnostics] Active text editor changed to: ${path.basename(editor.document.uri.fsPath)}`);
                setTimeout(() => {
                    diagnosticManager.scheduleAnalysis(editor.document, false, false, 'documentActivate');
                }, 500);
            }
        }),

        diagnosticManager
    );

    if (vscode.window.activeTextEditor && vscode.window.activeTextEditor.document.languageId === 'thrift') {
        diagnosticManager.scheduleAnalysis(vscode.window.activeTextEditor.document, true, false, 'extensionActivate');
    }
}
