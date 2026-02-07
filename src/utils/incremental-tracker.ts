import * as vscode from 'vscode';
import {config} from '../config';
import {LineRange, lineRangeFromChange} from './line-range';

/**
 * Parse change types to distinguish between formatting and parsing changes
 */
export enum ChangeType {
    FORMATTING = 'formatting',
    PARSING = 'parsing'
}

/**
 * Change tracking record
 */
export interface ChangeRecord {
    type: ChangeType;
    range: LineRange;
    timestamp: number;
}

/**
 * IncrementalTracker：记录文档脏区，用于增量格式化/分析。
 */
export class IncrementalTracker {
    private static instance: IncrementalTracker;
    private dirtyRanges: Map<string, LineRange[]> = new Map();
    private changeRecords: Map<string, ChangeRecord[]> = new Map(); // Track different types of changes

    // Pre-allocated arrays to reduce allocation
    private readonly maxRecords = 100; // Limit records to prevent memory issues

    private constructor() {
    }

    static getInstance(): IncrementalTracker {
        if (!this.instance) {
            this.instance = new IncrementalTracker();
        }
        return this.instance;
    }

    /**
     * 记录文档变更，按行范围存储脏区。
     */
    markChanges(event: vscode.TextDocumentChangeEvent, changeType: ChangeType = ChangeType.FORMATTING): void {
        if (event.document.languageId !== 'thrift') {
            return;
        }
        if (!config.incremental.formattingEnabled && !config.incremental.analysisEnabled) {
            return;
        }
        const key = event.document.uri.toString();

        // Use a more efficient approach to get or create arrays
        let ranges = this.dirtyRanges.get(key);
        if (!ranges) {
            ranges = [];
            this.dirtyRanges.set(key, ranges);
        }

        let records = this.changeRecords.get(key);
        if (!records) {
            records = [];
            this.changeRecords.set(key, records);
        }

        event.contentChanges.forEach(change => {
            const range = lineRangeFromChange(change);
            ranges!.push(range);

            // Add change record
            records!.push({
                type: changeType,
                range,
                timestamp: Date.now()
            });
        });

        // Optimize the merge operation by reducing redundant work
        this.dirtyRanges.set(key, this.mergeLineRangesOptimized(ranges));

        // Efficiently limit records to prevent memory issues
        if (records.length > this.maxRecords) {
            // Use slice to keep only the last N records efficiently
            records.splice(0, records.length - this.maxRecords);
        }
    }

    /**
     * Efficiently merge line ranges with optimized performance.
     */
    private mergeLineRangesOptimized(ranges: LineRange[]): LineRange[] {
        if (!ranges.length) {
            return [];
        }

        // Normalize and sort in one pass
        const normalized = ranges
            .map(range => this.normalizeLineRange(range))
            .filter((range): range is LineRange => range !== null)
            .sort((a, b) => a.startLine - b.startLine || a.endLine - b.endLine);

        if (!normalized.length) {
            return [];
        }

        // Use a more efficient merging algorithm
        const result: LineRange[] = [normalized[0]];

        for (let i = 1; i < normalized.length; i++) {
            const current = normalized[i];
            const last = result[result.length - 1];

            if (current.startLine <= last.endLine + 1) {
                // Overlapping or adjacent ranges, merge them
                result[result.length - 1] = {
                    startLine: last.startLine,
                    endLine: Math.max(last.endLine, current.endLine)
                };
            } else {
                // Non-overlapping range, add to result
                result.push(current);
            }
        }

        return result;
    }

    private normalizeLineRange(range: LineRange | null | undefined): LineRange | null {
        if (!range) {
            return null;
        }
        const startLine = Math.min(range.startLine, range.endLine);
        const endLine = Math.max(range.startLine, range.endLine);
        if (!Number.isFinite(startLine) || !Number.isFinite(endLine)) {
            return null;
        }
        return {startLine, endLine};
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

        const merged = this.mergeLineRangesOptimized(ranges);
        const totalLines = merged.reduce((acc, range) => acc + this.lineRangeLineCount(range), 0);
        if (totalLines > config.incremental.maxDirtyLines) {
            return undefined;
        }
        return this.collapseLineRanges(merged) ?? undefined;
    }

    private collapseLineRanges(ranges: LineRange[]): LineRange | null {
        if (!ranges.length) {
            return null;
        }
        const normalized = this.mergeLineRangesOptimized(ranges);
        if (!normalized.length) {
            return null;
        }
        return {
            startLine: Math.min(...normalized.map(range => range.startLine)),
            endLine: Math.max(...normalized.map(range => range.endLine))
        };
    }

    private lineRangeLineCount(range: LineRange): number {
        const normalized = this.normalizeLineRange(range);
        if (!normalized) {
            return 0;
        }
        return normalized.endLine - normalized.startLine + 1;
    }

    /**
     * 获取最近的解析变更范围。
     */
    getRecentParsingChanges(document: vscode.TextDocument, withinMs = 5000): LineRange[] {
        const key = document.uri.toString();
        const records = this.changeRecords.get(key) ?? [];

        const now = Date.now();
        const recentParsingChanges = records
            .filter(record =>
                record.type === ChangeType.PARSING &&
                (now - record.timestamp) <= withinMs
            )
            .map(record => record.range);

        return this.mergeLineRangesOptimized(recentParsingChanges);
    }

    /**
     * 清理指定文档的变更记录。
     */
    clearChangeRecords(document: vscode.TextDocument): void {
        const key = document.uri.toString();
        this.dirtyRanges.delete(key);
        this.changeRecords.delete(key);
    }
}
