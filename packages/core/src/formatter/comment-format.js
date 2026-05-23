"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatBlockComment = void 0;
function formatBlockComment(lines, startIndex, indentLevel, inService, serviceIndentLevel, options, deps) {
    const originalLine = lines[startIndex];
    const line = originalLine.trim();
    if (!line.startsWith('/*')) {
        return null;
    }
    const commentLines = [originalLine];
    let j = startIndex + 1;
    let closed = line.includes('*/');
    while (!closed && j < lines.length) {
        commentLines.push(lines[j]);
        if (lines[j].includes('*/')) {
            closed = true;
        }
        j++;
    }
    const indentStr = inService
        ? deps.getServiceIndent(serviceIndentLevel + 1, options)
        : deps.getIndent(indentLevel, options);
    if (commentLines.length === 1) {
        return {
            formattedLines: [indentStr + line],
            endIndex: startIndex
        };
    }
    const formattedLines = [];
    const openTrim = commentLines[0].trim();
    const openIsDoc = openTrim.startsWith('/**');
    const openToken = openIsDoc ? '/**' : '/*';
    const openRest = openTrim.slice(openToken.length);
    formattedLines.push(indentStr + openToken + openRest);
    for (let k = 1; k < commentLines.length - 1; k++) {
        let mid = commentLines[k].trim();
        if (mid.startsWith('*')) {
            mid = mid.slice(1);
        }
        mid = mid.replace(/^\s*/, '');
        const alignmentSpace = ' ';
        if (mid.length > 0) {
            formattedLines.push(indentStr + alignmentSpace + '* ' + mid);
        }
        else {
            formattedLines.push(indentStr + alignmentSpace + '*');
        }
    }
    const closingSpace = ' ';
    formattedLines.push(indentStr + closingSpace + '*/');
    return {
        formattedLines,
        endIndex: j - 1
    };
}
exports.formatBlockComment = formatBlockComment;
//# sourceMappingURL=comment-format.js.map