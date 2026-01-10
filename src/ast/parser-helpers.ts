import * as vscode from 'vscode';
import * as nodes from './nodes.types';
import {tokenizeText} from './tokenizer';
import {offsetToPosition, splitTopLevelCommasWithOffsets, stripLineComments} from './text-utils';
import {findDefaultValueRange} from './ranges';

export * from './text-utils';
export * from './ranges';

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
