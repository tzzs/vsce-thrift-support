
/** Represents a contiguous span of lines (0-indexed, inclusive). */
export interface LineRange {
    startLine: number;
    endLine: number;
}

/**
 * Create a normalised LineRange, clamping start to ≥0 and end to ≥start.
 * Fractional values are floored.
 */
export function createLineRange(startLine: number, endLine: number): LineRange {
    const s = Math.max(0, Math.floor(startLine));
    const e = Math.max(s, Math.floor(endLine));
    return {startLine: s, endLine: e};
}

/**
 * Return a normalised copy of `range`, or `null` if input is falsy or
 * contains non-finite values.
 */
export function normalizeLineRange(range: LineRange | null | undefined): LineRange | null {
    if (!range) {
        return null;
    }
    const startLine = Math.min(range.startLine, range.endLine);
    const endLine = Math.max(range.startLine, range.endLine);
    if (!Number.isFinite(startLine) || !Number.isFinite(endLine)) {
        return null;
    }
    return createLineRange(startLine, endLine);
}

/**
 * Merge an array of line ranges into the minimum set of non-overlapping
 * ranges sorted by start line.  Adjacent ranges (gap ≤ 1) are coalesced.
 */
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

/** Collapse an array of ranges into a single bounding range, or `null` if empty. */
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

/** Number of lines covered by `range` (inclusive, minimum 0). */
export function lineRangeLineCount(range: LineRange): number {
    const normalized = normalizeLineRange(range);
    if (!normalized) {
        return 0;
    }
    return normalized.endLine - normalized.startLine + 1;
}

/** True if `range` and `lineRange` share at least one line. Accepts any Range-shaped object. */
export function rangeIntersectsLineRange(range: {start: {line: number}; end: {line: number}}, lineRange: LineRange): boolean {
    return range.start.line <= lineRange.endLine && range.end.line >= lineRange.startLine;
}

/** True if `lineRange` is fully contained within `range`. */
export function rangeContainsLineRange(range: {start: {line: number}; end: {line: number}}, lineRange: LineRange): boolean {
    return range.start.line <= lineRange.startLine && range.end.line >= lineRange.endLine;
}

/**
 * Derive a LineRange from a text-change event.
 * `lineDelta` is the net line count of the inserted text minus the replaced text.
 */
export function lineRangeFromChange(change: {range: {start: {line: number}; end: {line: number}}; text: string}): LineRange {
    const startLine = change.range.start.line;
    const lineDelta = change.text.split('\n').length - 1;
    const endLine = change.range.end.line + lineDelta;
    return createLineRange(startLine, endLine);
}
