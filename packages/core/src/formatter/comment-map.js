"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getInlineComment = exports.buildCommentMap = void 0;
const tokenizer_1 = require("../ast/tokenizer");
function classifyKind(raw) {
    if (raw.startsWith('/**')) {
        return 'doc';
    }
    if (raw.startsWith('/*')) {
        return 'block';
    }
    return 'line';
}
function classifyPosition(commentCol, lineText, lineIndex, astIndex) {
    const before = lineText.slice(0, commentCol).trim();
    if (before.length === 0) {
        if (astIndex !== null) {
            const isInStructOrEnum = astIndex.structFieldIndex.has(lineIndex) ||
                astIndex.enumMemberIndex.has(lineIndex);
            if (!isInStructOrEnum &&
                !astIndex.structStarts.has(lineIndex) &&
                !astIndex.enumStarts.has(lineIndex) &&
                !astIndex.serviceStarts.has(lineIndex) &&
                !astIndex.constStarts.has(lineIndex)) {
                const nextLine = lineIndex + 1;
                const hasNodeOnNext = astIndex.structStarts.has(nextLine) ||
                    astIndex.enumStarts.has(nextLine) ||
                    astIndex.serviceStarts.has(nextLine) ||
                    astIndex.constStarts.has(nextLine) ||
                    astIndex.interactionStarts.has(nextLine);
                if (hasNodeOnNext) {
                    return 'leading';
                }
                return 'dangling';
            }
        }
        return 'leading';
    }
    return 'inline';
}
function buildCommentMap(source, astIndex = null) {
    const byLine = new Map();
    const all = [];
    const lines = source.split('\n');
    const tokenizer = new tokenizer_1.ThriftTokenizer();
    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
        const lineText = lines[lineIdx];
        const result = tokenizer.scanLine(lineText);
        for (const token of result.tokens) {
            if (token.type !== 'comment') {
                continue;
            }
            const kind = classifyKind(token.value);
            const position = classifyPosition(token.start, lineText, lineIdx, astIndex);
            const info = {
                kind,
                text: token.value,
                position,
                sourceLine: lineIdx,
                sourceColumn: token.start
            };
            all.push(info);
            const existing = byLine.get(lineIdx);
            if (existing !== undefined) {
                existing.push(info);
            }
            else {
                byLine.set(lineIdx, [info]);
            }
        }
    }
    return { byLine, all };
}
exports.buildCommentMap = buildCommentMap;
function getInlineComment(lineNumber, commentMap) {
    const comments = commentMap.byLine.get(lineNumber);
    if (comments === undefined) {
        return '';
    }
    const inline = comments.find(c => c.position === 'inline');
    return inline !== undefined ? inline.text : '';
}
exports.getInlineComment = getInlineComment;
//# sourceMappingURL=comment-map.js.map