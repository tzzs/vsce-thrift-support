import * as vscode from 'vscode';

export interface LineRange {
    startLine: number;
    endLine: number;
}

export function normalizeLineRange(range: LineRange | null | undefined): LineRange | null {
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

export function mergeLineRanges(ranges: LineRange[]): LineRange[] {
    if (!ranges.length) {
        return [];
    }
    const normalized = ranges
        .map(range => normalizeLineRange(range))
        .filter((range): range is LineRange => range !== null)
        .sort((a, b) => a.startLine - b.startLine || a.endLine - b.endLine);
    if (!normalized.length) {
        return [];
    }
    const merged: LineRange[] = [];
    let current = normalized[0];
    for (let i = 1; i < normalized.length; i++) {
        const next = normalized[i];
        if (next.startLine <= current.endLine + 1) {
            current = {
                startLine: current.startLine,
                endLine: Math.max(current.endLine, next.endLine)
            };
        } else {
            merged.push(current);
            current = next;
        }
    }
    merged.push(current);
    return merged;
}

export function collapseLineRanges(ranges: LineRange[]): LineRange | null {
    if (!ranges.length) {
        return null;
    }
    const normalized = mergeLineRanges(ranges);
    if (!normalized.length) {
        return null;
    }
    return {
        startLine: Math.min(...normalized.map(range => range.startLine)),
        endLine: Math.max(...normalized.map(range => range.endLine))
    };
}

export function lineRangeLineCount(range: LineRange): number {
    const normalized = normalizeLineRange(range);
    if (!normalized) {
        return 0;
    }
    return normalized.endLine - normalized.startLine + 1;
}

export function rangeIntersectsLineRange(range: vscode.Range, lineRange: LineRange): boolean {
    return range.start.line <= lineRange.endLine && range.end.line >= lineRange.startLine;
}

export function rangeContainsLineRange(range: vscode.Range, lineRange: LineRange): boolean {
    return range.start.line <= lineRange.startLine && range.end.line >= lineRange.endLine;
}

export function lineRangeFromChange(change: {range: vscode.Range; text: string}): LineRange {
    const startLine = change.range.start.line;
    const lineDelta = change.text.split('\n').length - 1;
    const endLine = change.range.end.line + lineDelta;
    return {startLine, endLine};
}

export function lineRangeToVscodeRange(document: vscode.TextDocument, lineRange: LineRange): vscode.Range {
    const totalLines = typeof document.lineCount === 'number'
        ? document.lineCount
        : document.getText().split('\n').length;
    const lastLine = Math.max(0, totalLines - 1);
    const normalized = normalizeLineRange(lineRange);
    if (!normalized) {
        const start = new vscode.Position(0, 0);
        return new vscode.Range(start, start);
    }
    const startLine = Math.min(Math.max(normalized.startLine, 0), lastLine);
    const endLine = Math.min(Math.max(normalized.endLine, startLine), lastLine);
    const start = new vscode.Position(startLine, 0);
    const endLineText = document.lineAt(endLine).text;
    const end = new vscode.Position(endLine, endLineText.length);
    return new vscode.Range(start, end);
}
