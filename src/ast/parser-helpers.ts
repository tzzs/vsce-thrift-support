import * as vscode from 'vscode';
import * as nodes from './nodes.types';
import { tokenizeText } from './tokenizer';

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
 * 解析字段列表文本。
 * @param text 字段文本
 * @param baseLine 起始行
 * @param baseChar 起始列
 * @returns 字段列表
 */
export function parseFieldList(text: string, baseLine: number, baseChar: number): nodes.Field[] {
    const fields: nodes.Field[] = [];
    const segments = splitTopLevelCommasWithOffsets(text);
    for (const seg of segments) {
        const leading = seg.text.match(/^\s*/)?.[0].length ?? 0;
        const segmentText = stripLineComments(seg.text).trim();
        if (!segmentText) {
            continue;
        }
        const segmentStart = seg.start + leading;
        const segmentEnd = segmentStart + segmentText.length;
        const tokens = tokenizeText(segmentText).filter(token => token.type !== 'whitespace' && token.type !== 'comment');
        if (tokens.length === 0) {
            continue;
        }
        const idIndex = tokens.findIndex(token => token.type === 'number');
        if (idIndex === -1) {
            continue;
        }
        let colonIndex = -1;
        for (let i = idIndex + 1; i < tokens.length; i++) {
            if (tokens[i].type === 'symbol' && tokens[i].value === ':') {
                colonIndex = i;
                break;
            }
        }
        if (colonIndex === -1) {
            continue;
        }
        let cursor = colonIndex + 1;
        let requiredness: 'required' | 'optional' | undefined;
        if (tokens[cursor]?.type === 'identifier' &&
            (tokens[cursor].value === 'required' || tokens[cursor].value === 'optional')) {
            requiredness = tokens[cursor].value as 'required' | 'optional';
            cursor += 1;
        }
        const typeStartToken = tokens[cursor];
        if (!typeStartToken) {
            continue;
        }
        let nameTokenIndex = -1;
        let angleDepth = 0;
        for (let i = cursor; i < tokens.length; i++) {
            const token = tokens[i];
            if (token.type === 'symbol') {
                if (token.value === '<') {
                    angleDepth += 1;
                } else if (token.value === '>') {
                    angleDepth = Math.max(0, angleDepth - 1);
                }
                if (angleDepth === 0 && (token.value === '=' || token.value === '(' || token.value === ',' || token.value === ';')) {
                    break;
                }
                continue;
            }
            if (token.type === 'identifier') {
                nameTokenIndex = i;
            }
        }
        if (nameTokenIndex === -1) {
            continue;
        }
        const nameToken = tokens[nameTokenIndex];
        const fieldType = segmentText.slice(typeStartToken.start, nameToken.start).trim();
        if (!fieldType) {
            continue;
        }
        const defaultInfo = findDefaultValueRange(segmentText);
        const startPos = offsetToPosition(text, baseLine, baseChar, segmentStart);
        const endPos = offsetToPosition(text, baseLine, baseChar, segmentEnd);
        const nameStart = offsetToPosition(text, baseLine, baseChar, segmentStart + nameToken.start);
        const nameEnd = offsetToPosition(text, baseLine, baseChar, segmentStart + nameToken.end);
        const typeStart = offsetToPosition(text, baseLine, baseChar, segmentStart + typeStartToken.start);
        const typeEnd = offsetToPosition(text, baseLine, baseChar, segmentStart + nameToken.start);
        const defaultStart = defaultInfo ? offsetToPosition(text, baseLine, baseChar, segmentStart + defaultInfo.start) : null;
        const defaultEnd = defaultInfo ? offsetToPosition(text, baseLine, baseChar, segmentStart + defaultInfo.end) : null;
        const field: nodes.Field = {
            type: nodes.ThriftNodeType.Field,
            range: new vscode.Range(startPos.line, startPos.char, endPos.line, endPos.char),
            nameRange: new vscode.Range(nameStart.line, nameStart.char, nameEnd.line, nameEnd.char),
            typeRange: new vscode.Range(typeStart.line, typeStart.char, typeEnd.line, typeEnd.char),
            parent: null as any,
            id: parseInt(tokens[idIndex].value, 10),
            requiredness: requiredness ?? 'required',
            fieldType,
            name: nameToken.value,
            defaultValue: defaultInfo?.value,
            defaultValueRange: defaultStart && defaultEnd ? new vscode.Range(defaultStart.line, defaultStart.char, defaultEnd.line, defaultEnd.char) : undefined
        };
        fields.push(field);
    }
    return fields;
}

/**
 * 解析字段默认值范围与文本。
 * @param segmentText 字段文本
 * @returns 默认值信息或 null
 */
export function findDefaultValueRange(segmentText: string): { start: number; end: number; value: string } | null {
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
        if (ch === '\'') { inS = true; continue; }
        if (ch === '"') { inD = true; continue; }
        if (ch === '<') { depthAngle++; continue; }
        if (ch === '>') { depthAngle = Math.max(0, depthAngle - 1); continue; }
        if (ch === '[') { depthBracket++; continue; }
        if (ch === ']') { depthBracket = Math.max(0, depthBracket - 1); continue; }
        if (ch === '{') { depthBrace++; continue; }
        if (ch === '}') { depthBrace = Math.max(0, depthBrace - 1); continue; }
        if (ch === '(') { depthParen++; continue; }
        if (ch === ')') { depthParen = Math.max(0, depthParen - 1); continue; }
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
 * 在范围内寻找 throws 的参数起点。
 * @param lines 文档行内容
 * @param startLine 起始行
 * @param startChar 起始列
 * @param endLine 结束行
 * @param endChar 结束列
 * @returns throws 参数起始位置
 */
export function findThrowsStartInRange(
    lines: string[],
    startLine: number,
    startChar: number,
    endLine: number,
    endChar: number
): { line: number; char: number } | null {
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
        } else {
            const parenIdx = segment.indexOf('(');
            if (parenIdx !== -1) {
                return { line, char: searchStart + parenIdx };
            }
        }
    }
    return null;
}

/**
 * 构建 const 值范围与文本。
 * @param lines 文档行内容
 * @param startLine 起始行
 * @param endLine 结束行
 * @param eqLine 等号所在行
 * @param eqChar 等号所在列
 * @returns const 值范围与文本
 */
export function buildConstValueRange(
    lines: string[],
    startLine: number,
    endLine: number,
    eqLine: number,
    eqChar: number
): { range?: vscode.Range; value: string } {
    if (eqLine < 0 || eqChar < 0) {
        return { range: undefined, value: '' };
    }
    const start = findFirstNonWhitespaceAfter(lines, eqLine, eqChar, endLine);
    const end = findLastNonWhitespaceUpTo(lines, eqLine, endLine);
    if (!start || !end) {
        return { range: undefined, value: '' };
    }
    const range = new vscode.Range(start.line, start.char, end.line, end.char);
    return { range, value: sliceTextByRange(lines, range) };
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

/**
 * 计算初始化表达式范围。
 * @param line 原始行文本
 * @param codeOnly 去注释后的文本
 * @param initializer 初始化表达式
 * @param lineNumber 行号
 * @returns 初始化范围
 */
export function findInitializerRange(
    line: string,
    codeOnly: string,
    initializer: string | undefined,
    lineNumber: number
): vscode.Range | undefined {
    if (!initializer) {
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
    return new vscode.Range(lineNumber, startChar, lineNumber, endChar);
}

/**
 * 计算名称范围。
 * @param line 原始行文本
 * @param lineNumber 行号
 * @param name 名称文本
 * @param codeOnly 去注释后的文本
 * @returns 名称范围
 */
export function findNameRangeInLine(
    line: string,
    lineNumber: number,
    name: string,
    codeOnly: string
): vscode.Range | undefined {
    const codeIndex = line.indexOf(codeOnly);
    const searchStart = codeIndex >= 0 ? codeIndex : 0;
    return findWordRangeInLine(line, lineNumber, name, searchStart);
}

/**
 * 在行内搜索单词范围。
 * @param line 原始行文本
 * @param lineNumber 行号
 * @param word 目标单词
 * @param searchStart 起始列
 * @returns 单词范围
 */
export function findWordRangeInLine(
    line: string,
    lineNumber: number,
    word: string,
    searchStart: number
): vscode.Range | undefined {
    if (!word) {
        return undefined;
    }
    const escaped = escapeRegExp(word);
    const regex = new RegExp(`\\b${escaped}\\b`, 'g');
    let match: RegExpExecArray | null;
    while ((match = regex.exec(line)) !== null) {
        if (match.index >= searchStart) {
            return new vscode.Range(lineNumber, match.index, lineNumber, match.index + word.length);
        }
    }
    return undefined;
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
 * 查找类型文本的范围。
 * @param line 原始行文本
 * @param lineNumber 行号
 * @param typeText 类型文本
 * @param searchStart 起始列
 * @returns 类型范围
 */
export function findTypeRangeInLine(
    line: string,
    lineNumber: number,
    typeText: string,
    searchStart: number
): vscode.Range | undefined {
    if (!typeText) {
        return undefined;
    }
    const idx = line.indexOf(typeText, searchStart);
    if (idx >= 0) {
        return new vscode.Range(lineNumber, idx, lineNumber, idx + typeText.length);
    }
    return undefined;
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
