import * as vscode from 'vscode';
import * as nodes from '../ast/nodes.types';
import {
    LineRange,
    mergeLineRanges,
    normalizeLineRange,
    rangeContainsLineRange,
    rangeIntersectsLineRange
} from '../utils/line-range';

export function stripCommentsFromLine(rawLine: string, state: { inBlock: boolean }): string {
    let out = '';
    let inS = false, inD = false, escaped = false;
    for (let i = 0; i < rawLine.length;) {
        const ch = rawLine[i];
        const next = i + 1 < rawLine.length ? rawLine[i + 1] : '';

        if (!inS && !inD && !state.inBlock && ch === '/' && next === '*') {
            state.inBlock = true;
            i += 2;
            continue;
        }
        if (state.inBlock) {
            const endIdx = rawLine.indexOf('*/', i);
            if (endIdx === -1) {
                return out;
            } else {
                state.inBlock = false;
                i = endIdx + 2;
                continue;
            }
        }

        if ((ch === '"' && !inS && !escaped) || (ch === "'" && !inD && !escaped)) {
            if (ch === '"') {
                inD = !inD;
            } else {
                inS = !inS;
            }
            out += ch;
            i++;
            continue;
        }
        if ((inS || inD) && ch === '\\' && !escaped) {
            out += ch;
            i++;
            escaped = true;
            continue;
        }
        if (escaped) {
            out += ch;
            i++;
            escaped = false;
            continue;
        }

        if (!inS && !inD) {
            if ((ch === '/' && next === '/') || ch === '#') {
                break;
            }
        }

        out += ch;
        i++;
    }
    return out;
}

function stripStringLiterals(rawLine: string): string {
    let out = '';
    let inS = false;
    let inD = false;
    let escaped = false;

    for (let i = 0; i < rawLine.length; i++) {
        const ch = rawLine[i];

        if (escaped) {
            escaped = false;
            continue;
        }
        if (inS) {
            if (ch === '\\') {
                escaped = true;
                continue;
            }
            if (ch === '\'') {
                inS = false;
            }
            continue;
        }
        if (inD) {
            if (ch === '\\') {
                escaped = true;
                continue;
            }
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

        out += ch;
    }

    return out;
}

const STRUCTURAL_TOKEN_PATTERN = /\b(struct|union|exception|enum|senum|service|typedef|const|namespace|include)\b/;
const STRUCTURAL_CHAR_PATTERN = /[{}]/;

export function sanitizeStructuralText(rawLine: string): string {
    const withoutComments = stripCommentsFromLine(rawLine, {inBlock: false});
    return stripStringLiterals(withoutComments);
}

export function hasStructuralTokens(rawLine: string): boolean {
    const sanitized = sanitizeStructuralText(rawLine);
    return STRUCTURAL_CHAR_PATTERN.test(sanitized) || STRUCTURAL_TOKEN_PATTERN.test(sanitized);
}

export function includesKeyword(rawLine: string): boolean {
    return /\binclude\b/.test(sanitizeStructuralText(rawLine));
}

export const diagnosticsTestUtils = {
    includesKeyword,
    hasStructuralTokens,
    sanitizeStructuralText
};

export function findBestContainingRange(ast: nodes.ThriftDocument, dirtyRange: LineRange) {
    const normalized = normalizeLineRange(dirtyRange);
    if (!normalized) {
        return null;
    }
    let best: LineRange | null = null;
    let bestSpan = Number.POSITIVE_INFINITY;
    for (const node of ast.body) {
        if (node.range.start.line > normalized.startLine || node.range.end.line < normalized.endLine) {
            continue;
        }
        const span = node.range.end.line - node.range.start.line;
        if (span < bestSpan) {
            bestSpan = span;
            best = {startLine: node.range.start.line, endLine: node.range.end.line};
        }
    }
    return best;
}

export function findBestContainingRangeForChanges(ast: nodes.ThriftDocument, dirtyRanges: LineRange[]) {
    const merged = mergeLineRanges(dirtyRanges);
    if (!merged.length) {
        return null;
    }
    let best: LineRange | null = null;
    let bestSpan = Number.POSITIVE_INFINITY;
    for (const node of ast.body) {
        const containsAll = merged.every(range => rangeContainsLineRange(node.range, range));
        if (!containsAll) {
            continue;
        }
        const span = node.range.end.line - node.range.start.line;
        if (span < bestSpan) {
            bestSpan = span;
            best = {startLine: node.range.start.line, endLine: node.range.end.line};
        }
    }
    return best;
}

export function findBestContainingMemberRange(ast: nodes.ThriftDocument, dirtyRange: LineRange) {
    const normalized = normalizeLineRange(dirtyRange);
    if (!normalized) {
        return null;
    }
    let best: LineRange | null = null;
    let bestSpan = Number.POSITIVE_INFINITY;
    for (const node of ast.body) {
        if (!rangeContainsLineRange(node.range, normalized)) {
            continue;
        }
        let members: Array<{ range: vscode.Range }> = [];
        if (node.type === nodes.ThriftNodeType.Struct || node.type === nodes.ThriftNodeType.Union || node.type === nodes.ThriftNodeType.Exception) {
            members = (node as nodes.Struct).fields;
        } else if (node.type === nodes.ThriftNodeType.Enum) {
            members = (node as nodes.Enum).members;
        } else if (node.type === nodes.ThriftNodeType.Service) {
            members = (node as nodes.Service).functions;
        } else {
            continue;
        }
        for (const member of members) {
            if (!rangeContainsLineRange(member.range, normalized)) {
                continue;
            }
            const span = member.range.end.line - member.range.start.line;
            if (span < bestSpan) {
                bestSpan = span;
                best = {startLine: member.range.start.line, endLine: member.range.end.line};
            }
        }
    }
    return best;
}

export function findBestContainingMemberRangeForChanges(ast: nodes.ThriftDocument, dirtyRanges: LineRange[]) {
    const merged = mergeLineRanges(dirtyRanges);
    if (!merged.length) {
        return null;
    }
    let best: LineRange | null = null;
    let bestSpan = Number.POSITIVE_INFINITY;
    for (const node of ast.body) {
        const containsAll = merged.every(range => rangeContainsLineRange(node.range, range));
        if (!containsAll) {
            continue;
        }
        let members: Array<{ range: vscode.Range }> = [];
        if (node.type === nodes.ThriftNodeType.Struct || node.type === nodes.ThriftNodeType.Union || node.type === nodes.ThriftNodeType.Exception) {
            members = (node as nodes.Struct).fields;
        } else if (node.type === nodes.ThriftNodeType.Enum) {
            members = (node as nodes.Enum).members;
        } else if (node.type === nodes.ThriftNodeType.Service) {
            members = (node as nodes.Service).functions;
        } else {
            continue;
        }
        for (const member of members) {
            const memberContainsAll = merged.every(range => rangeContainsLineRange(member.range, range));
            if (!memberContainsAll) {
                continue;
            }
            const span = member.range.end.line - member.range.start.line;
            if (span < bestSpan) {
                bestSpan = span;
                best = {startLine: member.range.start.line, endLine: member.range.end.line};
            }
        }
    }
    return best;
}

export function findContainingNode(ast: nodes.ThriftDocument, targetRange: LineRange) {
    const normalized = normalizeLineRange(targetRange);
    if (!normalized) {
        return null;
    }
    let best: nodes.ThriftDocument['body'][number] | null = null;
    let bestSpan = Number.POSITIVE_INFINITY;
    for (const node of ast.body) {
        if (!rangeContainsLineRange(node.range, normalized)) {
            continue;
        }
        const span = node.range.end.line - node.range.start.line;
        if (span < bestSpan) {
            bestSpan = span;
            best = node;
        }
    }
    return best;
}

export function buildPartialLines(lines: string[], startLine: number, endLine: number): string[] {
    return lines.map((line, idx) => (idx >= startLine && idx <= endLine) ? line : '');
}

export function hashText(text: string): number {
    let hash = 5381;
    for (let i = 0; i < text.length; i++) {
        hash = ((hash << 5) + hash) + text.charCodeAt(i);
        hash |= 0;
    }
    return hash;
}

export function filterIssuesByLineRange(issues: { range: vscode.Range }[], lineRange: LineRange) {
    return issues.filter(issue => rangeIntersectsLineRange(issue.range, lineRange));
}
