import * as vscode from 'vscode';
import {
    escapeRegExp,
    findFirstNonWhitespaceAfter,
    findLastNonWhitespaceUpTo,
    sliceTextByRange
} from './text-utils';

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
