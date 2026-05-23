"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.findTypeRangeInLine = exports.findWordRangeInLine = exports.findNameRangeInLine = exports.findInitializerRange = exports.buildConstValueRange = exports.findThrowsStartInRange = exports.findDefaultValueRange = void 0;
const types_1 = require("../types");
const text_utils_1 = require("./text-utils");
function findDefaultValueRange(segmentText) {
    let depthAngle = 0;
    let depthBracket = 0;
    let depthBrace = 0;
    let depthParen = 0;
    let inS = false;
    let inD = false;
    let escaped = false;
    for (let i = 0; i < segmentText.length; i++) {
        const ch = segmentText[i];
        if (inS) {
            if (!escaped && ch === '\\') {
                escaped = true;
                continue;
            }
            if (!escaped && ch === '\'') {
                inS = false;
            }
            escaped = false;
            continue;
        }
        if (inD) {
            if (!escaped && ch === '\\') {
                escaped = true;
                continue;
            }
            if (!escaped && ch === '"') {
                inD = false;
            }
            escaped = false;
            continue;
        }
        if (ch === '\'') {
            inS = true;
            continue;
        }
        if (ch === '"') {
            inD = true;
            continue;
        }
        if (ch === '<') {
            depthAngle++;
            continue;
        }
        if (ch === '>') {
            depthAngle = Math.max(0, depthAngle - 1);
            continue;
        }
        if (ch === '[') {
            depthBracket++;
            continue;
        }
        if (ch === ']') {
            depthBracket = Math.max(0, depthBracket - 1);
            continue;
        }
        if (ch === '{') {
            depthBrace++;
            continue;
        }
        if (ch === '}') {
            depthBrace = Math.max(0, depthBrace - 1);
            continue;
        }
        if (ch === '(') {
            depthParen++;
            continue;
        }
        if (ch === ')') {
            depthParen = Math.max(0, depthParen - 1);
            continue;
        }
        if (ch === '=' && depthAngle === 0 && depthBracket === 0 && depthBrace === 0 && depthParen === 0) {
            const tail = segmentText.slice(i + 1);
            const leading = tail.match(/^\s*/)?.[0].length ?? 0;
            const value = tail.slice(leading).trimEnd();
            const start = i + 1 + leading;
            const end = start + value.length;
            return { start, end, value };
        }
        escaped = false;
    }
    return null;
}
exports.findDefaultValueRange = findDefaultValueRange;
function findThrowsStartInRange(lines, startLine, startChar, endLine, endChar) {
    let seenThrows = false;
    for (let line = startLine; line < lines.length; line++) {
        if (line > endLine) {
            break;
        }
        const lineText = lines[line];
        const searchStart = line === startLine ? startChar : 0;
        const searchEnd = line === endLine ? endChar : lineText.length;
        const segment = lineText.slice(searchStart, searchEnd);
        if (!seenThrows) {
            const idx = segment.indexOf('throws');
            if (idx !== -1) {
                seenThrows = true;
                const parenIdx = segment.indexOf('(', idx + 'throws'.length);
                if (parenIdx !== -1) {
                    return { line, char: searchStart + parenIdx };
                }
            }
        }
        else {
            const parenIdx = segment.indexOf('(');
            if (parenIdx !== -1) {
                return { line, char: searchStart + parenIdx };
            }
        }
    }
    return null;
}
exports.findThrowsStartInRange = findThrowsStartInRange;
function buildConstValueRange(lines, startLine, endLine, eqLine, eqChar) {
    if (eqLine < 0 || eqChar < 0) {
        return { range: undefined, value: '' };
    }
    const start = (0, text_utils_1.findFirstNonWhitespaceAfter)(lines, eqLine, eqChar, endLine);
    const end = (0, text_utils_1.findLastNonWhitespaceUpTo)(lines, eqLine, endLine);
    if (!start || !end) {
        return { range: undefined, value: '' };
    }
    const range = new types_1.Range(start.line, start.char, end.line, end.char);
    return { range, value: (0, text_utils_1.sliceTextByRange)(lines, range) };
}
exports.buildConstValueRange = buildConstValueRange;
function findInitializerRange(line, codeOnly, initializer, lineNumber) {
    if (initializer === undefined || initializer === '') {
        return undefined;
    }
    const codeIndex = line.indexOf(codeOnly);
    if (codeIndex === -1) {
        return undefined;
    }
    const eqIndex = codeOnly.indexOf('=');
    if (eqIndex === -1) {
        return undefined;
    }
    const initText = initializer.trim();
    const afterEq = codeOnly.slice(eqIndex + 1);
    const leading = afterEq.match(/^\s*/)?.[0].length ?? 0;
    const startChar = codeIndex + eqIndex + 1 + leading;
    const endChar = startChar + initText.length;
    return new types_1.Range(lineNumber, startChar, lineNumber, endChar);
}
exports.findInitializerRange = findInitializerRange;
function findNameRangeInLine(line, lineNumber, name, codeOnly) {
    const codeIndex = line.indexOf(codeOnly);
    const searchStart = codeIndex >= 0 ? codeIndex : 0;
    return findWordRangeInLine(line, lineNumber, name, searchStart);
}
exports.findNameRangeInLine = findNameRangeInLine;
function findWordRangeInLine(line, lineNumber, word, searchStart) {
    if (!word) {
        return undefined;
    }
    const escaped = (0, text_utils_1.escapeRegExp)(word);
    const regex = new RegExp(`\\b${escaped}\\b`, 'g');
    let match;
    while ((match = regex.exec(line)) !== null) {
        if (match.index >= searchStart) {
            return new types_1.Range(lineNumber, match.index, lineNumber, match.index + word.length);
        }
    }
    return undefined;
}
exports.findWordRangeInLine = findWordRangeInLine;
function findTypeRangeInLine(line, lineNumber, typeText, searchStart) {
    if (!typeText) {
        return undefined;
    }
    const idx = line.indexOf(typeText, searchStart);
    if (idx >= 0) {
        return new types_1.Range(lineNumber, idx, lineNumber, idx + typeText.length);
    }
    return undefined;
}
exports.findTypeRangeInLine = findTypeRangeInLine;
//# sourceMappingURL=ranges.js.map