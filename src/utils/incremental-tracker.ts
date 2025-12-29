import * as vscode from 'vscode';
import { config } from '../config';

/**
 * IncrementalTracker：记录文档脏区，用于增量格式化/分析。
 */
export class IncrementalTracker {
    private static instance: IncrementalTracker;
    private dirtyRanges: Map<string, vscode.Range[]> = new Map();

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
            const start = change.range.start.line;
            const end = change.range.end.line + (change.text.split('\n').length - 1);
            ranges.push(new vscode.Range(start, 0, end, 0));
        });

        this.dirtyRanges.set(key, this.mergeRanges(ranges));
    }

    /**
     * 获取并清除文档脏区，若超出阈值则返回 undefined 交给全量处理。
     */
    consumeDirtyRange(document: vscode.TextDocument): vscode.Range | undefined {
        const key = document.uri.toString();
        const ranges = this.dirtyRanges.get(key);
        this.dirtyRanges.delete(key);
        if (!ranges || ranges.length === 0) {
            return undefined;
        }
        const merged = this.mergeRanges(ranges);
        const totalLines = merged.reduce((acc, r) => acc + (r.end.line - r.start.line + 1), 0);
        if (totalLines > config.incremental.maxDirtyLines) {
            return undefined;
        }
        const startLine = Math.min(...merged.map(r => r.start.line));
        const endLine = Math.max(...merged.map(r => r.end.line));
        return new vscode.Range(new vscode.Position(startLine, 0), new vscode.Position(endLine + 1, 0));
    }

    private mergeRanges(ranges: vscode.Range[]): vscode.Range[] {
        if (ranges.length === 0) {
            return [];
        }
        const sorted = ranges
            .map(r => new vscode.Range(r.start.line, r.start.character, r.end.line, r.end.character))
            .sort((a, b) => a.start.line - b.start.line || a.start.character - b.start.character);
        const merged: vscode.Range[] = [];
        let current = sorted[0];
        for (let i = 1; i < sorted.length; i++) {
            const next = sorted[i];
            if (next.start.line <= current.end.line + 1) {
                current = new vscode.Range(
                    current.start,
                    next.end.line > current.end.line ? next.end : current.end
                );
            } else {
                merged.push(current);
                current = next;
            }
        }
        merged.push(current);
        return merged;
    }
}
