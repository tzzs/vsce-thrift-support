import * as vscode from 'vscode';
import {config} from '../config';
import {collapseLineRanges, LineRange, lineRangeFromChange, lineRangeLineCount, mergeLineRanges} from './line-range';

/**
 * IncrementalTracker：记录文档脏区，用于增量格式化/分析。
 */
export class IncrementalTracker {
    private static instance: IncrementalTracker;
    private dirtyRanges: Map<string, LineRange[]> = new Map();

    static getInstance(): IncrementalTracker {
        if (!this.instance) {
            this.instance = new IncrementalTracker();
        }
        return this.instance;
    }

    /**
     * 记录文档变更，按行范围存储脏区。
     */
    markChanges(event: vscode.TextDocumentChangeEvent): void {
        if (event.document.languageId !== 'thrift') {
            return;
        }
        if (!config.incremental.formattingEnabled && !config.incremental.analysisEnabled) {
            return;
        }
        const key = event.document.uri.toString();
        const ranges = this.dirtyRanges.get(key) ?? [];

        event.contentChanges.forEach(change => {
            ranges.push(lineRangeFromChange(change));
        });

        this.dirtyRanges.set(key, mergeLineRanges(ranges));
    }

    /**
     * 获取并清除文档脏区，若超出阈值则返回 undefined 交给全量处理。
     */
    consumeDirtyRange(document: vscode.TextDocument): LineRange | undefined {
        const key = document.uri.toString();
        const ranges = this.dirtyRanges.get(key);
        this.dirtyRanges.delete(key);
        if (!ranges || ranges.length === 0) {
            return undefined;
        }
        const merged = mergeLineRanges(ranges);
        const totalLines = merged.reduce((acc, range) => acc + lineRangeLineCount(range), 0);
        if (totalLines > config.incremental.maxDirtyLines) {
            return undefined;
        }
        return collapseLineRanges(merged) ?? undefined;
    }
}
