import {ThriftTokenizer} from '../ast/tokenizer';
import type {AstIndex} from './ast-index';

export type CommentPosition = 'leading' | 'trailing' | 'inline' | 'dangling';

export interface CommentInfo {
    kind: 'line' | 'block' | 'doc';
    text: string;
    position: CommentPosition;
    sourceLine: number;
    sourceColumn: number;
}

export interface CommentMap {
    byLine: Map<number, CommentInfo[]>;
    all: CommentInfo[];
}

function classifyKind(raw: string): 'line' | 'block' | 'doc' {
    if (raw.startsWith('/**')) {
        return 'doc';
    }
    if (raw.startsWith('/*')) {
        return 'block';
    }
    return 'line';
}

function classifyPosition(
    commentCol: number,
    lineText: string,
    lineIndex: number,
    astIndex: AstIndex | null
): CommentPosition {
    const before = lineText.slice(0, commentCol).trim();
    if (before.length === 0) {
        if (astIndex !== null) {
            const isInStructOrEnum =
                astIndex.structFieldIndex.has(lineIndex) ||
                astIndex.enumMemberIndex.has(lineIndex);
            if (!isInStructOrEnum &&
                !astIndex.structStarts.has(lineIndex) &&
                !astIndex.enumStarts.has(lineIndex) &&
                !astIndex.serviceStarts.has(lineIndex) &&
                !astIndex.constStarts.has(lineIndex)) {
                const nextLine = lineIndex + 1;
                const hasNodeOnNext =
                    astIndex.structStarts.has(nextLine) ||
                    astIndex.enumStarts.has(nextLine) ||
                    astIndex.serviceStarts.has(nextLine) ||
                    astIndex.constStarts.has(nextLine) ||
                    astIndex.interactionStarts.has(nextLine);
                if (hasNodeOnNext) {
                    return 'leading';
                }
                return 'dangling';
            }
        }
        return 'leading';
    }
    return 'inline';
}

export function buildCommentMap(source: string, astIndex: AstIndex | null = null): CommentMap {
    const byLine = new Map<number, CommentInfo[]>();
    const all: CommentInfo[] = [];

    const lines = source.split('\n');
    const tokenizer = new ThriftTokenizer();

    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
        const lineText = lines[lineIdx];
        const result = tokenizer.scanLine(lineText);

        for (const token of result.tokens) {
            if (token.type !== 'comment') {
                continue;
            }
            const kind = classifyKind(token.value);
            const position = classifyPosition(token.start, lineText, lineIdx, astIndex);

            const info: CommentInfo = {
                kind,
                text: token.value,
                position,
                sourceLine: lineIdx,
                sourceColumn: token.start
            };

            all.push(info);
            const existing = byLine.get(lineIdx);
            if (existing !== undefined) {
                existing.push(info);
            } else {
                byLine.set(lineIdx, [info]);
            }
        }
    }

    return {byLine, all};
}

export function getInlineComment(lineNumber: number, commentMap: CommentMap): string {
    const comments = commentMap.byLine.get(lineNumber);
    if (comments === undefined) {
        return '';
    }
    const inline = comments.find(c => c.position === 'inline');
    return inline !== undefined ? inline.text : '';
}
