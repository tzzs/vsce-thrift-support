import {Range} from '../types';
import * as nodes from './nodes.types';
import {createField} from './factory';
import {findDefaultValueRange, findInitializerRange, stripTrailingAnnotation} from './parser-helpers';
import {findSymbolIndex, findSymbolIndexFrom} from './token-utils';
import {Token} from './tokenizer';

export function computeStructFieldEndLine(lines: string[], startLine: number): number {
    let depthAngle = 0;
    let depthBracket = 0;
    let depthBrace = 0;
    let depthParen = 0;
    let inBlockComment = false;

    for (let lineIndex = startLine; lineIndex < lines.length; lineIndex++) {
        const stripped = stripCommentsAndStrings(lines[lineIndex] ?? '', inBlockComment);
        inBlockComment = stripped.endsInBlockComment;
        const text = stripped.text;
        for (let charIndex = 0; charIndex < text.length; charIndex++) {
            const char = text[charIndex];
            if (char === '<') { depthAngle++; continue; }
            if (char === '>') { depthAngle = Math.max(0, depthAngle - 1); continue; }
            if (char === '[') { depthBracket++; continue; }
            if (char === ']') { depthBracket = Math.max(0, depthBracket - 1); continue; }
            if (char === '{') { depthBrace++; continue; }
            if (char === '}') {
                if (depthBrace === 0) {
                    return Math.max(startLine, lineIndex - 1);
                }
                depthBrace--;
                continue;
            }
            if (char === '(') { depthParen++; continue; }
            if (char === ')') { depthParen = Math.max(0, depthParen - 1); continue; }
            if (depthAngle === 0 && depthBracket === 0 && depthBrace === 0 && depthParen === 0
                && (char === ',' || char === ';')) {
                return lineIndex;
            }
        }
        if (!inBlockComment) {
            const next = findNextNonEmptyLineRaw(lines, lineIndex + 1);
            if (next === -1) { return lineIndex; }
            const nextStripped = stripCommentsAndStrings(lines[next] ?? '', false).text.trim();
            if (/^\d+\s*:/.test(nextStripped)) {
                return lineIndex;
            }
            if (depthAngle === 0 && depthBracket === 0 && depthBrace === 0 && depthParen === 0
                && nextStripped.startsWith('}')) {
                return lineIndex;
            }
        }
    }
    return lines.length - 1;
}

export function parseStructFieldLine(
    parent: nodes.Struct,
    line: string,
    cleanLine: string,
    tokens: Token[],
    lineNumber: number
): nodes.Field | null {
    const trimmed = cleanLine.trim();
    if (!trimmed || tokens.length === 0) {
        return null;
    }
    const idIndex = tokens.findIndex(token => token.type === 'number');
    if (idIndex === -1) {
        return null;
    }
    const colonIndex = findSymbolIndexFrom(tokens, ':', idIndex + 1);
    if (colonIndex === -1) {
        return null;
    }
    let cursor = colonIndex + 1;
    let requiredness: 'required' | 'optional' | undefined;
    if (tokens[cursor]?.type === 'identifier' &&
        (tokens[cursor].value === 'required' || tokens[cursor].value === 'optional')) {
        requiredness = tokens[cursor].value as 'required' | 'optional';
        cursor += 1;
    }
    const typeStartToken = tokens[cursor];
    if (typeStartToken === undefined) {
        return null;
    }
    let nameTokenIndex = -1;
    let angleDepth = 0;
    for (let index = cursor; index < tokens.length; index++) {
        const token = tokens[index];
        if (token.type === 'symbol') {
            if (token.value === '<') {
                angleDepth += 1;
            } else if (token.value === '>') {
                angleDepth = Math.max(0, angleDepth - 1);
            }
            if (angleDepth === 0 && (token.value === '(' || token.value === '=' || token.value === ',' || token.value === ';')) {
                break;
            }
            continue;
        }
        if (token.type === 'identifier') {
            nameTokenIndex = index;
        }
    }
    if (nameTokenIndex === -1) {
        return null;
    }
    const nameToken = tokens[nameTokenIndex];
    const fieldType = cleanLine.slice(typeStartToken.start, nameToken.start).trim();
    if (!fieldType) {
        return null;
    }
    const valueTarget = stripTrailingAnnotation(cleanLine.replace(/[,;]\s*$/, ''));
    const defaultInfo = findDefaultValueRange(valueTarget);
    return createField({
        range: new Range(lineNumber, 0, lineNumber, line.length),
        nameRange: new Range(lineNumber, nameToken.start, lineNumber, nameToken.end),
        typeRange: new Range(lineNumber, typeStartToken.start, lineNumber, nameToken.start),
        parent,
        id: parseInt(tokens[idIndex].value, 10),
        requiredness,
        fieldType,
        name: nameToken.value,
        defaultValue: defaultInfo?.value,
        defaultValueRange: defaultInfo !== null
            ? new Range(lineNumber, defaultInfo.start, lineNumber, defaultInfo.end)
            : undefined
    });
}

export function parseEnumMemberLine(
    parent: nodes.Enum,
    line: string,
    cleanLine: string,
    tokens: Token[],
    lineNumber: number
): nodes.EnumMember | null {
    const trimmed = cleanLine.trim();
    if (!trimmed || tokens.length === 0) {
        return null;
    }
    const nameToken = tokens.find(token => token.type === 'identifier');
    if (!nameToken) {
        return null;
    }
    const equalsIndex = findSymbolIndex(tokens, '=');
    let initializer: string | undefined;
    let initializerRange: Range | undefined;
    if (equalsIndex !== -1) {
        const initializerBounds = readInitializerBounds(tokens, equalsIndex);
        if (initializerBounds !== null) {
            const rawInitializer = cleanLine.slice(initializerBounds.start, initializerBounds.end).trim();
            const trimmedInitializer = stripTrailingAnnotation(rawInitializer.replace(/[,;]\s*$/, '')).trim();
            initializer = trimmedInitializer || undefined;
            if (initializer !== undefined && initializer !== '') {
                initializerRange = new Range(lineNumber, initializerBounds.start, lineNumber, initializerBounds.end);
            }
        }
    }
    initializerRange ??= findInitializerRange(cleanLine, cleanLine, initializer, lineNumber);
    return {
        type: nodes.ThriftNodeType.EnumMember,
        range: new Range(lineNumber, 0, lineNumber, line.length),
        nameRange: new Range(lineNumber, nameToken.start, lineNumber, nameToken.end),
        parent,
        name: nameToken.value,
        initializer,
        initializerRange
    };
}

function readInitializerBounds(tokens: Token[], equalsIndex: number): {start: number; end: number} | null {
    let startOffset: number | null = null;
    let endOffset: number | null = null;
    let angleDepth = 0;
    let bracketDepth = 0;
    let braceDepth = 0;
    let parenDepth = 0;
    for (let index = equalsIndex + 1; index < tokens.length; index++) {
        const token = tokens[index];
        if (token.type === 'symbol') {
            if (token.value === '<') {
                angleDepth += 1;
            } else if (token.value === '>') {
                angleDepth = Math.max(0, angleDepth - 1);
            } else if (token.value === '[') {
                bracketDepth += 1;
            } else if (token.value === ']') {
                bracketDepth = Math.max(0, bracketDepth - 1);
            } else if (token.value === '{') {
                braceDepth += 1;
            } else if (token.value === '}') {
                braceDepth = Math.max(0, braceDepth - 1);
            } else if (token.value === '(') {
                parenDepth += 1;
            } else if (token.value === ')') {
                parenDepth = Math.max(0, parenDepth - 1);
            }
            if (angleDepth === 0 && bracketDepth === 0 && braceDepth === 0 && parenDepth === 0 &&
                (token.value === ',' || token.value === ';' || token.value === '(')) {
                break;
            }
        }
        startOffset ??= token.start;
        endOffset = token.end;
    }
    return startOffset !== null && endOffset !== null ? {start: startOffset, end: endOffset} : null;
}

function findNextNonEmptyLineRaw(lines: string[], startIndex: number): number {
    for (let index = startIndex; index < lines.length; index++) {
        if (stripCommentsAndStrings(lines[index] ?? '', false).text.trim()) {
            return index;
        }
    }
    return -1;
}

function stripCommentsAndStrings(line: string, inBlockComment: boolean): {text: string; endsInBlockComment: boolean} {
    let output = '';
    let index = 0;
    let block = inBlockComment;
    let escaped = false;
    while (index < line.length) {
        if (block) {
            const close = line.indexOf('*/', index);
            if (close === -1) {
                return {text: output, endsInBlockComment: true};
            }
            index = close + 2;
            block = false;
            continue;
        }
        const char = line[index];
        const next = index + 1 < line.length ? line[index + 1] : '';
        if (char === '/' && next === '*') {
            block = true;
            index += 2;
            continue;
        }
        if ((char === '/' && next === '/') || char === '#') {
            break;
        }
        if (char === '"' || char === '\'') {
            const quote = char;
            index++;
            escaped = false;
            while (index < line.length) {
                const current = line[index];
                if (escaped) { escaped = false; index++; continue; }
                if (current === '\\') { escaped = true; index++; continue; }
                if (current === quote) { index++; break; }
                index++;
            }
            continue;
        }
        output += char;
        index++;
    }
    return {text: output, endsInBlockComment: block};
}
