import * as nodes from './nodes.types';
import {QuoteTracker} from '../utils/quote-tracker';
import {buildConstValueRange, findTypeRangeInLine, findWordRangeInLine} from './parser-helpers';
import {Range} from '../types';

export function parseConstDeclarationNode(
    parent: nodes.ThriftNode,
    lines: string[],
    startLine: number,
    valueType: string,
    name: string
): {node: nodes.Const; endLine: number} {
    const line = lines[startLine] ?? '';
    const keywordIndex = line.indexOf('const');
    const searchStart = keywordIndex >= 0 ? keywordIndex + 'const'.length : 0;
    let endLine = startLine;
    let depthBrace = 0;
    let depthBracket = 0;
    let depthParen = 0;
    let seenEquals = false;
    let eqLine = -1;
    let eqChar = -1;
    const quoteTracker = new QuoteTracker();

    while (endLine < lines.length) {
        const currentLine = lines[endLine] ?? '';
        for (let index = 0; index < currentLine.length; index++) {
            const char = currentLine[index];
            if (quoteTracker.inside()) {
                quoteTracker.feed(char);
                continue;
            }
            if (char === '\'' || char === '"') {
                quoteTracker.feed(char);
                continue;
            }
            if (char === '=' && !seenEquals) {
                seenEquals = true;
                if (eqLine === -1) {
                    eqLine = endLine;
                    eqChar = index;
                }
                continue;
            }
            if (!seenEquals) {
                continue;
            }
            if (char === '{') {
                depthBrace++;
            }
            if (char === '}') {
                depthBrace = Math.max(0, depthBrace - 1);
            }
            if (char === '[') {
                depthBracket++;
            }
            if (char === ']') {
                depthBracket = Math.max(0, depthBracket - 1);
            }
            if (char === '(') {
                depthParen++;
            }
            if (char === ')') {
                depthParen = Math.max(0, depthParen - 1);
            }
        }

        if (seenEquals && depthBrace === 0 && depthBracket === 0 && depthParen === 0) {
            break;
        }
        endLine++;
    }

    const valueRangeInfo = buildConstValueRange(lines, startLine, endLine, eqLine, eqChar);
    return {
        node: {
            type: nodes.ThriftNodeType.Const,
            range: new Range(startLine, 0, endLine, (lines[endLine] ?? '').length),
            nameRange: findWordRangeInLine(line, startLine, name, searchStart),
            parent,
            valueType,
            valueTypeRange: findTypeRangeInLine(line, startLine, valueType, searchStart),
            name,
            value: valueRangeInfo.value,
            valueRange: valueRangeInfo.range
        },
        endLine
    };
}
