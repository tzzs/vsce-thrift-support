import {Range} from '../types';
import * as nodes from './nodes.types';
import {
    findThrowsStartInRange,
    parseFieldList,
    readParenthesizedText
} from './parser-helpers';
import {findSymbolIndex} from './token-utils';
import {Token} from './tokenizer';

export interface ParsedServiceFunction {
    name: string;
    returnType: string;
    nameRange: Range | undefined;
    returnTypeRange: Range | undefined;
    oneway: boolean;
    isStream: boolean;
    isSink: boolean;
    funcStartLine: number;
    funcStartChar: number;
    funcEndLine: number;
    funcEndChar: number;
}

export interface ParsedThrows {
    fields: nodes.Field[];
    endLine: number;
    endChar: number;
}

export function parsePerforms(
    parent: nodes.ThriftNode,
    line: string,
    cleanLine: string,
    tokens: Token[],
    lineNumber: number
): nodes.Performs | null {
    const trimmed = cleanLine.trim();
    if (!trimmed || tokens.length === 0) {
        return null;
    }
    if (tokens[0].type !== 'identifier' || tokens[0].value !== 'performs') {
        return null;
    }
    const nameToken = tokens[1];
    if (nameToken === undefined || nameToken.type !== 'identifier') {
        return null;
    }
    const nameRange = new Range(lineNumber, nameToken.start, lineNumber, nameToken.end);
    return {
        type: nodes.ThriftNodeType.Performs,
        range: new Range(lineNumber, 0, lineNumber, line.length),
        nameRange,
        parent,
        name: nameToken.value,
        interactionName: nameToken.value,
        interactionNameRange: nameRange
    };
}

export function parseServiceFunctionLine(
    line: string,
    cleanLine: string,
    tokens: Token[],
    lineNumber: number
): ParsedServiceFunction | null {
    const trimmed = cleanLine.trim();
    if (!trimmed || tokens.length === 0) {
        return null;
    }
    const parenIndex = findSymbolIndex(tokens, '(');
    if (parenIndex === -1) {
        return null;
    }
    let nameTokenIndex = -1;
    for (let index = parenIndex - 1; index >= 0; index--) {
        if (tokens[index].type === 'identifier') {
            nameTokenIndex = index;
            break;
        }
    }
    if (nameTokenIndex === -1) {
        return null;
    }
    const oneway = tokens[0].type === 'identifier' && tokens[0].value === 'oneway';
    let returnTypeStartIndex = oneway ? 1 : 0;
    let isStream = false;
    let isSink = false;
    if (returnTypeStartIndex < tokens.length && tokens[returnTypeStartIndex].type === 'identifier') {
        if (tokens[returnTypeStartIndex].value === 'stream') {
            isStream = true;
            returnTypeStartIndex += 1;
        } else if (tokens[returnTypeStartIndex].value === 'sink') {
            isSink = true;
            returnTypeStartIndex += 1;
        }
    }
    const returnTypeStartToken = tokens[returnTypeStartIndex];
    if (returnTypeStartToken === undefined || returnTypeStartIndex >= nameTokenIndex) {
        return null;
    }
    const nameToken = tokens[nameTokenIndex];
    const typeStart = isStream || isSink ? returnTypeStartIndex - 1 : returnTypeStartIndex;
    const returnType = cleanLine.slice(tokens[typeStart].start, nameToken.start).trim();
    if (!returnType) {
        return null;
    }
    return {
        name: nameToken.value,
        returnType,
        nameRange: new Range(lineNumber, nameToken.start, lineNumber, nameToken.end),
        returnTypeRange: new Range(lineNumber, tokens[typeStart].start, lineNumber, nameToken.start),
        oneway,
        isStream,
        isSink,
        funcStartLine: lineNumber,
        funcStartChar: tokens[typeStart].start,
        funcEndLine: lineNumber,
        funcEndChar: line.length
    };
}

export function findFunctionEnd(
    lines: string[],
    startLine: number,
    startChar: number,
    initialParenCount: number
): {endLine: number; endChar: number} | null {
    let parenCount = initialParenCount;
    for (let lineNumber = startLine; lineNumber < lines.length; lineNumber++) {
        const text = lines[lineNumber] ?? '';
        const colStart = lineNumber === startLine ? startChar : 0;
        for (let index = colStart; index < text.length; index++) {
            if (text[index] === '(') {
                parenCount++;
            } else if (text[index] === ')') {
                parenCount--;
                if (parenCount === 0) {
                    const endChar = skipThrowsBlock(text, index + 1);
                    if (endChar < text.length && (text[endChar] === ',' || text[endChar] === ';' || text[endChar] === '{')) {
                        return {endLine: lineNumber, endChar: endChar + 1};
                    }
                }
            }
        }
    }
    return null;
}

export function parseFunctionThrows(
    lines: string[],
    argsEndLine: number,
    argsEndChar: number,
    funcEndLine: number,
    funcEndChar: number
): ParsedThrows {
    const fields: nodes.Field[] = [];
    let resultEndLine = funcEndLine;
    let resultEndChar = funcEndChar;

    const throwsStart = findThrowsStartInRange(lines, argsEndLine, argsEndChar, funcEndLine, funcEndChar);
    if (throwsStart) {
        const throwsResult = readParenthesizedText(lines, throwsStart.line, throwsStart.char + 1);
        if (throwsResult) {
            fields.push(...parseFieldList(throwsResult.text, throwsStart.line, throwsStart.char + 1));
            resultEndLine = throwsResult.endLine;
            resultEndChar = throwsResult.endChar;
        }
    }
    return {fields, endLine: resultEndLine, endChar: resultEndChar};
}

function skipThrowsBlock(line: string, start: number): number {
    if (line.substring(start, start + 6) !== 'throws') {
        return start;
    }
    let throwsParenCount = 0;
    let index = start + 6;
    for (; index < line.length; index++) {
        if (line[index] === '(') {
            throwsParenCount++;
        } else if (line[index] === ')') {
            throwsParenCount--;
            if (throwsParenCount === 0) {
                index++;
                break;
            }
        }
    }
    while (index < line.length && /\s/.test(line[index] ?? '')) {
        index++;
    }
    return index;
}
