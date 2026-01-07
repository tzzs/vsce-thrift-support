import * as vscode from 'vscode';

/**
 * 剔除行内注释内容，保留字符串字面量。
 * @param line 行内容
 * @returns 去除注释后的文本
 */
export function stripLineComments(line: string): string {
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

/**
 * 处理行尾的注解。
 * @param line 行内容
 * @returns 去除注解后的行内容
 */
export function stripTrailingAnnotation(line: string): string {
    let trimmed = line.trimEnd();
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

/**
 * 分割顶层逗号并保留偏移量。
 * @param text 输入文本
 * @returns 分割后的文本片段及其起始偏移量数组
 */
export function splitTopLevelCommasWithOffsets(text: string): Array<{ text: string; start: number }> {
    const parts: Array<{ text: string; start: number }> = [];
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
        if (ch === '<') { depthAngle++; continue; }
        if (ch === '>') { depthAngle = Math.max(0, depthAngle - 1); continue; }
        if (ch === '[') { depthBracket++; continue; }
        if (ch === ']') { depthBracket = Math.max(0, depthBracket - 1); continue; }
        if (ch === '{') { depthBrace++; continue; }
        if (ch === '}') { depthBrace = Math.max(0, depthBrace - 1); continue; }
        if (ch === '(') { depthParen++; continue; }
        if (ch === ')') { depthParen = Math.max(0, depthParen - 1); continue; }

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

/**
 * 将文本偏移转换为行列坐标。
 * @param text 原始文本
 * @param baseLine 起始行
 * @param baseChar 起始列
 * @param offset 文本偏移
 * @returns 行列坐标
 */
export function offsetToPosition(
    text: string,
    baseLine: number,
    baseChar: number,
    offset: number
): { line: number; char: number } {
    let line = baseLine;
    let char = baseChar;
    for (let i = 0; i < offset && i < text.length; i++) {
        if (text[i] === '\n') {
            line++;
            char = 0;
        } else {
            char++;
        }
    }
    return { line, char };
}

/**
 * 读取匹配括号内的文本。
 * @param lines 文档行内容
 * @param startLine 起始行
 * @param startChar 起始列
 * @returns 文本与结束位置
 */
export function readParenthesizedText(
    lines: string[],
    startLine: number,
    startChar: number
): { text: string; endLine: number; endChar: number } | null {
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
            } else if (c === ')') {
                depth--;
                if (depth === 0) {
                    return { text, endLine: line, endChar: char };
                }
                text += c;
            } else {
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

/**
 * 查找首个非空白字符位置。
 * @param lines 文档行内容
 * @param line 起始行
 * @param char 起始列
 * @param limitLine 结束行
 * @returns 位置或 null
 */
export function findFirstNonWhitespaceAfter(
    lines: string[],
    line: number,
    char: number,
    limitLine: number
): { line: number; char: number } | null {
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

/**
 * 查找末尾的非空白字符位置。
 * @param lines 文档行内容
 * @param startLine 起始行
 * @param endLine 结束行
 * @returns 位置或 null
 */
export function findLastNonWhitespaceUpTo(
    lines: string[],
    startLine: number,
    endLine: number
): { line: number; char: number } | null {
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

/**
 * 计算单词偏移。
 * @param text 原始文本
 * @param word 目标单词
 * @returns 偏移或 null
 */
export function findWordOffset(text: string, word: string): number | null {
    if (!word) {
        return null;
    }
    const escaped = escapeRegExp(word);
    const regex = new RegExp(`\\b${escaped}\\b`, 'g');
    const match = regex.exec(text);
    return match ? match.index : null;
}

/**
 * 按范围截取文本。
 * @param lines 文档行内容
 * @param range 截取范围
 * @returns 文本内容
 */
export function sliceTextByRange(lines: string[], range: vscode.Range): string {
    if (range.start.line === range.end.line) {
        const line = lines[range.start.line] ?? '';
        return line.slice(range.start.character, range.end.character);
    }
    const parts: string[] = [];
    parts.push((lines[range.start.line] ?? '').slice(range.start.character));
    for (let i = range.start.line + 1; i < range.end.line; i++) {
        parts.push(lines[i] ?? '');
    }
    parts.push((lines[range.end.line] ?? '').slice(0, range.end.character));
    return parts.join('\n');
}

export function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
