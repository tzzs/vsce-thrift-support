"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.escapeRegExp = exports.sliceTextByRange = exports.findLastNonWhitespaceUpTo = exports.findFirstNonWhitespaceAfter = exports.readParenthesizedText = exports.offsetToPosition = exports.splitTopLevelCommasWithOffsets = exports.stripTrailingAnnotation = exports.stripLineComments = void 0;
function stripLineComments(line) {
    let out = '';
    let inS = false;
    let inD = false;
    let escaped = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        const next = i + 1 < line.length ? line[i + 1] : '';
        if (inS) {
            if (!escaped && ch === '\\') {
                escaped = true;
                out += ch;
                continue;
            }
            if (!escaped && ch === '\'') {
                inS = false;
            }
            escaped = false;
            out += ch;
            continue;
        }
        if (inD) {
            if (!escaped && ch === '\\') {
                escaped = true;
                out += ch;
                continue;
            }
            if (!escaped && ch === '"') {
                inD = false;
            }
            escaped = false;
            out += ch;
            continue;
        }
        if (ch === '\'') {
            inS = true;
            out += ch;
            continue;
        }
        if (ch === '"') {
            inD = true;
            out += ch;
            continue;
        }
        if ((ch === '/' && next === '/') || ch === '#') {
            break;
        }
        out += ch;
    }
    return out;
}
exports.stripLineComments = stripLineComments;
function stripTrailingAnnotation(line) {
    const trimmed = line.trimEnd();
    if (!trimmed.endsWith(')')) {
        return line;
    }
    let inS = false;
    let inD = false;
    let escaped = false;
    let depth = 0;
    for (let i = trimmed.length - 1; i >= 0; i--) {
        const ch = trimmed[i];
        if (escaped) {
            escaped = false;
            continue;
        }
        if (ch === '\\') {
            escaped = true;
            continue;
        }
        if (inS) {
            if (ch === '\'') {
                inS = false;
            }
            continue;
        }
        if (inD) {
            if (ch === '"') {
                inD = false;
            }
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
        if (ch === ')') {
            depth++;
            continue;
        }
        if (ch === '(') {
            depth--;
            if (depth === 0) {
                return trimmed.slice(0, i).trimEnd();
            }
        }
    }
    return line;
}
exports.stripTrailingAnnotation = stripTrailingAnnotation;
function splitTopLevelCommasWithOffsets(text) {
    const parts = [];
    let start = 0;
    let depthAngle = 0;
    let depthBracket = 0;
    let depthBrace = 0;
    let depthParen = 0;
    let inS = false;
    let inD = false;
    let escaped = false;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
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
        if (ch === ',' && depthAngle === 0 && depthBracket === 0 && depthBrace === 0 && depthParen === 0) {
            const segment = text.slice(start, i);
            const leading = segment.match(/^\s*/)?.[0].length ?? 0;
            const trimmed = segment.trim();
            if (trimmed) {
                parts.push({ text: trimmed, start: start + leading });
            }
            start = i + 1;
        }
    }
    const tail = text.slice(start);
    const leading = tail.match(/^\s*/)?.[0].length ?? 0;
    const trimmed = tail.trim();
    if (trimmed) {
        parts.push({ text: trimmed, start: start + leading });
    }
    return parts;
}
exports.splitTopLevelCommasWithOffsets = splitTopLevelCommasWithOffsets;
function offsetToPosition(text, baseLine, baseChar, offset) {
    let line = baseLine;
    let char = baseChar;
    for (let i = 0; i < offset && i < text.length; i++) {
        if (text[i] === '\n') {
            line++;
            char = 0;
        }
        else {
            char++;
        }
    }
    return { line, char };
}
exports.offsetToPosition = offsetToPosition;
function readParenthesizedText(lines, startLine, startChar) {
    let line = startLine;
    let char = startChar;
    let depth = 1;
    let text = '';
    while (line < lines.length) {
        const lineText = lines[line];
        while (char < lineText.length) {
            const c = lineText[char];
            if (c === '(') {
                depth++;
                text += c;
            }
            else if (c === ')') {
                depth--;
                if (depth === 0) {
                    return { text, endLine: line, endChar: char };
                }
                text += c;
            }
            else {
                text += c;
            }
            char++;
        }
        line++;
        char = 0;
        if (line < lines.length) {
            text += '\n';
        }
    }
    return null;
}
exports.readParenthesizedText = readParenthesizedText;
function findFirstNonWhitespaceAfter(lines, line, char, limitLine) {
    let currentLine = line;
    let currentChar = char + 1;
    while (currentLine < lines.length && currentLine <= limitLine) {
        const text = lines[currentLine] ?? '';
        while (currentChar < text.length) {
            const ch = text[currentChar];
            if (!/\s/.test(ch)) {
                return { line: currentLine, char: currentChar };
            }
            currentChar++;
        }
        currentLine++;
        currentChar = 0;
    }
    return null;
}
exports.findFirstNonWhitespaceAfter = findFirstNonWhitespaceAfter;
function findLastNonWhitespaceUpTo(lines, startLine, endLine) {
    for (let line = endLine; line >= startLine; line--) {
        const text = lines[line] ?? '';
        for (let i = text.length - 1; i >= 0; i--) {
            const ch = text[i];
            if (!/\s/.test(ch) && ch !== ';') {
                return { line, char: i + 1 };
            }
            if (ch === '/' && i > 0 && text[i - 1] === '/') {
                break;
            }
        }
    }
    return null;
}
exports.findLastNonWhitespaceUpTo = findLastNonWhitespaceUpTo;
function sliceTextByRange(lines, range) {
    if (range.start.line === range.end.line) {
        const line = lines[range.start.line] ?? '';
        return line.slice(range.start.character, range.end.character);
    }
    const parts = [];
    parts.push((lines[range.start.line] ?? '').slice(range.start.character));
    for (let i = range.start.line + 1; i < range.end.line; i++) {
        parts.push(lines[i] ?? '');
    }
    parts.push((lines[range.end.line] ?? '').slice(0, range.end.character));
    return parts.join('\n');
}
exports.sliceTextByRange = sliceTextByRange;
function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
exports.escapeRegExp = escapeRegExp;
//# sourceMappingURL=text-utils.js.map