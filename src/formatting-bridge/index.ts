import * as vscode from 'vscode';
import { ThriftFormatter } from '../formatter';
import { config } from '../config';
import { IncrementalTracker } from '../utils/incremental-tracker';
import { ErrorHandler } from '../utils/error-handler';
import { CoreDependencies } from '../utils/dependencies';
import { lineRangeToVscodeRange } from '../utils/line-range';
import { computeInitialContext } from './context';
import { normalizeFormattingRange, buildMinimalEdits } from './range-utils';
import { resolveFormattingOptions } from './options';

/**
 * ThriftFormattingProvider：提供文档与选区格式化。
 */
export class ThriftFormattingProvider implements vscode.DocumentFormattingEditProvider, vscode.DocumentRangeFormattingEditProvider {
    private incrementalTracker: IncrementalTracker;
    private errorHandler: ErrorHandler;

    constructor(deps?: Partial<CoreDependencies>) {
        this.incrementalTracker = deps?.incrementalTracker ?? new IncrementalTracker();
        this.errorHandler = deps?.errorHandler ?? new ErrorHandler();
    }

    /**
     * 格式化整个文档。
     */
    provideDocumentFormattingEdits(
        document: vscode.TextDocument,
        options: vscode.FormattingOptions,
        _token: vscode.CancellationToken
    ): vscode.TextEdit[] {
        try {
            let targetRange: vscode.Range | undefined;
            let useMinimalPatch = false;

            // 增量格式化：在脏区范围内尝试最小化编辑
            if (config.incremental.formattingEnabled) {
                const dirtyRange = this.incrementalTracker.consumeDirtyRange(document);
                if (dirtyRange) {
                    targetRange = normalizeFormattingRange(
                        document,
                        lineRangeToVscodeRange(document, dirtyRange)
                    );
                    useMinimalPatch = true;
                }
            }

            const fullRange = new vscode.Range(
                document.positionAt(0),
                document.positionAt(document.getText().length)
            );

            return this.formatRange(document, targetRange ?? fullRange, options, useMinimalPatch);
        } catch (error) {
            this.errorHandler.handleError(error, {
                component: 'ThriftFormattingProvider',
                operation: 'provideDocumentFormattingEdits',
                filePath: document.uri.fsPath
            });
            return [];
        }
    }

    /**
     * 格式化指定范围。
     */
    provideDocumentRangeFormattingEdits(
        document: vscode.TextDocument,
        range: vscode.Range,
        options: vscode.FormattingOptions,
        _token: vscode.CancellationToken
    ): vscode.TextEdit[] {
        try {
            return this.formatRange(document, range, options);
        } catch (error) {
            this.errorHandler.handleError(error, {
                component: 'ThriftFormattingProvider',
                operation: 'provideDocumentRangeFormattingEdits',
                filePath: document.uri.fsPath,
                additionalInfo: { range: range.toString() }
            });
            return [];
        }
    }

    private formatRange(
        document: vscode.TextDocument,
        range: vscode.Range,
        options: vscode.FormattingOptions,
        useMinimalPatch: boolean = false
    ): vscode.TextEdit[] {
        const text = document.getText(range);
        const fmtOptions = resolveFormattingOptions(document, range, options, useMinimalPatch, {
            computeInitialContext
        });

        const formatter = new ThriftFormatter({ errorHandler: this.errorHandler });
        const formattedText = formatter.formatThriftCode(text, fmtOptions);

        if (!useMinimalPatch) {
            return [vscode.TextEdit.replace(range, formattedText)];
        }

        return buildMinimalEdits(document, range, text, formattedText);
    }
}
