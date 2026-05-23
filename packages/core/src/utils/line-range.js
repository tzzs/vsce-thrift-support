"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.lineRangeFromChange = exports.rangeContainsLineRange = exports.rangeIntersectsLineRange = exports.lineRangeLineCount = exports.collapseLineRanges = exports.mergeLineRanges = exports.normalizeLineRange = exports.createLineRange = void 0;
function createLineRange(startLine, endLine) {
    const s = Math.max(0, Math.floor(startLine));
    const e = Math.max(s, Math.floor(endLine));
    return { startLine: s, endLine: e };
}
exports.createLineRange = createLineRange;
function normalizeLineRange(range) {
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
exports.normalizeLineRange = normalizeLineRange;
function mergeLineRanges(ranges) {
    if (!ranges.length) {
        return [];
    }
    const normalized = ranges
        .map(range => normalizeLineRange(range))
        .filter((range) => range !== null)
        .sort((a, b) => a.startLine - b.startLine || a.endLine - b.endLine);
    if (!normalized.length) {
        return [];
    }
    const merged = [];
    let current = normalized[0];
    for (let i = 1; i < normalized.length; i++) {
        const next = normalized[i];
        if (next.startLine <= current.endLine + 1) {
            current = {
                startLine: current.startLine,
                endLine: Math.max(current.endLine, next.endLine)
            };
        }
        else {
            merged.push(current);
            current = next;
        }
    }
    merged.push(current);
    return merged;
}
exports.mergeLineRanges = mergeLineRanges;
function collapseLineRanges(ranges) {
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
exports.collapseLineRanges = collapseLineRanges;
function lineRangeLineCount(range) {
    const normalized = normalizeLineRange(range);
    if (!normalized) {
        return 0;
    }
    return normalized.endLine - normalized.startLine + 1;
}
exports.lineRangeLineCount = lineRangeLineCount;
function rangeIntersectsLineRange(range, lineRange) {
    return range.start.line <= lineRange.endLine && range.end.line >= lineRange.startLine;
}
exports.rangeIntersectsLineRange = rangeIntersectsLineRange;
function rangeContainsLineRange(range, lineRange) {
    return range.start.line <= lineRange.startLine && range.end.line >= lineRange.endLine;
}
exports.rangeContainsLineRange = rangeContainsLineRange;
function lineRangeFromChange(change) {
    const startLine = change.range.start.line;
    const lineDelta = change.text.split('\n').length - 1;
    const endLine = change.range.end.line + lineDelta;
    return createLineRange(startLine, endLine);
}
exports.lineRangeFromChange = lineRangeFromChange;
//# sourceMappingURL=line-range.js.map