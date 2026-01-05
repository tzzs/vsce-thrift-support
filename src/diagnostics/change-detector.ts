import * as vscode from 'vscode';
import { LineRange, collapseLineRanges, lineRangeFromChange, mergeLineRanges } from '../utils/line-range';
import { hasStructuralTokens, includesKeyword } from './utils';

export interface DirtyChangeSummary {
    /** 脏行数量 */
    dirtyLineCount?: number;
    /** include 是否可能发生变化 */
    includesMayChange: boolean;
    /** 合并后的脏范围 */
    dirtyRange?: LineRange;
    /** 原始脏范围列表 */
    dirtyRanges: LineRange[];
    /** 合并后的脏范围列表 */
    mergedDirtyRanges?: LineRange[];
    /** 是否存在结构性变化 */
    structuralChange: boolean;
}

/**
 * 根据文档变更生成增量分析所需的脏范围信息。
 * @param document 当前文档
 * @param changes 文档变更列表
 * @returns 脏范围汇总信息
 */
export function getDirtyChangeSummary(
    document: vscode.TextDocument,
    changes: readonly vscode.TextDocumentContentChangeEvent[]
): DirtyChangeSummary {
    const dirtyLineCount = changes.reduce((acc, change) => {
        const affected = change.text.split('\n').length - 1;
        const removed = change.range.end.line - change.range.start.line;
        return acc + Math.max(affected, removed);
    }, 0);

    let includesMayChange = false;
    const dirtyRanges: LineRange[] = [];
    let structuralChange = false;

    for (const change of changes) {
        if (!includesMayChange) {
            if (includesKeyword(change.text)) {
                includesMayChange = true;
            } else {
                try {
                    const lineText = document.lineAt(change.range.start.line).text;
                    if (includesKeyword(lineText)) {
                        includesMayChange = true;
                    }
                } catch {
                    // ignore line lookup failures
                }
            }
        }

        dirtyRanges.push(lineRangeFromChange(change));

        const startLine = change.range.start.line;
        const endLine = change.range.end.line;
        if (startLine !== endLine || change.text.includes('\n')) {
            structuralChange = true;
            continue;
        }

        if (hasStructuralTokens(change.text)) {
            structuralChange = true;
            continue;
        }

        try {
            const lineText = document.lineAt(change.range.start.line).text;
            if (hasStructuralTokens(lineText)) {
                structuralChange = true;
            }
        } catch {
            structuralChange = true;
        }
    }

    const mergedDirtyRanges = mergeLineRanges(dirtyRanges);
    const dirtyRange = collapseLineRanges(mergedDirtyRanges) ?? undefined;

    return {
        dirtyLineCount,
        includesMayChange,
        dirtyRange,
        dirtyRanges,
        mergedDirtyRanges,
        structuralChange
    };
}
