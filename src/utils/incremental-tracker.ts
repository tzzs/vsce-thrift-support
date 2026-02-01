import * as vscode from 'vscode';
import {config} from '../config';
import {collapseLineRanges, LineRange, lineRangeFromChange, lineRangeLineCount, mergeLineRanges} from './line-range';

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

    private constructor() {}

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
        const ranges = this.dirtyRanges.get(key) ?? [];
        const records = this.changeRecords.get(key) ?? [];

        event.contentChanges.forEach(change => {
            const range = lineRangeFromChange(change);
            ranges.push(range);

            // Add change record
            records.push({
                type: changeType,
                range,
                timestamp: Date.now()
            });
        });

        this.dirtyRanges.set(key, mergeLineRanges(ranges));

        // Limit records to prevent memory issues
        if (records.length > 100) {
            records.splice(0, records.length - 100); // Keep last 100 records
        }
        this.changeRecords.set(key, records);
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

    /**
     * 获取最近的解析变更范围。
     */
    getRecentParsingChanges(document: vscode.TextDocument, withinMs: number = 5000): LineRange[] {
        const key = document.uri.toString();
        const records = this.changeRecords.get(key) ?? [];

        const now = Date.now();
        const recentParsingChanges = records
            .filter(record =>
                record.type === ChangeType.PARSING &&
                (now - record.timestamp) <= withinMs
            )
            .map(record => record.range);

        return mergeLineRanges(recentParsingChanges);
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
