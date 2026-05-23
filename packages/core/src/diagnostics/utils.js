"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.filterIssuesByLineRange = exports.hashText = exports.buildPartialLines = exports.findContainingNode = exports.findBestContainingMemberRangeForChanges = exports.findBestContainingMemberRange = exports.findBestContainingRangeForChanges = exports.findBestContainingRange = exports.diagnosticsTestUtils = exports.includesKeyword = exports.hasStructuralTokens = exports.sanitizeStructuralText = exports.stripCommentsFromLine = void 0;
const nodes = __importStar(require("../ast/nodes.types"));
const line_range_1 = require("../utils/line-range");
function stripCommentsFromLine(rawLine, state) {
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
            }
            else {
                state.inBlock = false;
                i = endIdx + 2;
                continue;
            }
        }
        if ((ch === '"' && !inS && !escaped) || (ch === '\'' && !inD && !escaped)) {
            if (ch === '"') {
                inD = !inD;
            }
            else {
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
exports.stripCommentsFromLine = stripCommentsFromLine;
function stripStringLiterals(rawLine) {
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
function sanitizeStructuralText(rawLine) {
    const withoutComments = stripCommentsFromLine(rawLine, { inBlock: false });
    return stripStringLiterals(withoutComments);
}
exports.sanitizeStructuralText = sanitizeStructuralText;
function hasStructuralTokens(rawLine) {
    const sanitized = sanitizeStructuralText(rawLine);
    return STRUCTURAL_CHAR_PATTERN.test(sanitized) || STRUCTURAL_TOKEN_PATTERN.test(sanitized);
}
exports.hasStructuralTokens = hasStructuralTokens;
function includesKeyword(rawLine) {
    return /\binclude\b/.test(sanitizeStructuralText(rawLine));
}
exports.includesKeyword = includesKeyword;
exports.diagnosticsTestUtils = {
    includesKeyword,
    hasStructuralTokens,
    sanitizeStructuralText
};
function findBestContainingRange(ast, dirtyRange) {
    const normalized = (0, line_range_1.normalizeLineRange)(dirtyRange);
    if (!normalized) {
        return null;
    }
    let best = null;
    let bestSpan = Number.POSITIVE_INFINITY;
    for (const node of ast.body) {
        if (node.range.start.line > normalized.startLine || node.range.end.line < normalized.endLine) {
            continue;
        }
        const span = node.range.end.line - node.range.start.line;
        if (span < bestSpan) {
            bestSpan = span;
            best = (0, line_range_1.createLineRange)(node.range.start.line, node.range.end.line);
        }
    }
    return best;
}
exports.findBestContainingRange = findBestContainingRange;
function findBestContainingRangeForChanges(ast, dirtyRanges) {
    const merged = (0, line_range_1.mergeLineRanges)(dirtyRanges);
    if (!merged.length) {
        return null;
    }
    let best = null;
    let bestSpan = Number.POSITIVE_INFINITY;
    for (const node of ast.body) {
        const containsAll = merged.every(range => (0, line_range_1.rangeContainsLineRange)(node.range, range));
        if (!containsAll) {
            continue;
        }
        const span = node.range.end.line - node.range.start.line;
        if (span < bestSpan) {
            bestSpan = span;
            best = (0, line_range_1.createLineRange)(node.range.start.line, node.range.end.line);
        }
    }
    return best;
}
exports.findBestContainingRangeForChanges = findBestContainingRangeForChanges;
function findBestContainingMemberRange(ast, dirtyRange) {
    const normalized = (0, line_range_1.normalizeLineRange)(dirtyRange);
    if (!normalized) {
        return null;
    }
    let best = null;
    let bestSpan = Number.POSITIVE_INFINITY;
    for (const node of ast.body) {
        if (!(0, line_range_1.rangeContainsLineRange)(node.range, normalized)) {
            continue;
        }
        let members = [];
        if (node.type === nodes.ThriftNodeType.Struct || node.type === nodes.ThriftNodeType.Union || node.type === nodes.ThriftNodeType.Exception) {
            members = (node).fields;
        }
        else if (node.type === nodes.ThriftNodeType.Enum) {
            members = (node).members;
        }
        else if (node.type === nodes.ThriftNodeType.Service) {
            members = (node).functions;
        }
        else {
            continue;
        }
        for (const member of members) {
            if (!(0, line_range_1.rangeContainsLineRange)(member.range, normalized)) {
                continue;
            }
            const span = member.range.end.line - member.range.start.line;
            if (span < bestSpan) {
                bestSpan = span;
                best = (0, line_range_1.createLineRange)(member.range.start.line, member.range.end.line);
            }
        }
    }
    return best;
}
exports.findBestContainingMemberRange = findBestContainingMemberRange;
function findBestContainingMemberRangeForChanges(ast, dirtyRanges) {
    const merged = (0, line_range_1.mergeLineRanges)(dirtyRanges);
    if (!merged.length) {
        return null;
    }
    let best = null;
    let bestSpan = Number.POSITIVE_INFINITY;
    for (const node of ast.body) {
        const containsAll = merged.every(range => (0, line_range_1.rangeContainsLineRange)(node.range, range));
        if (!containsAll) {
            continue;
        }
        let members = [];
        if (node.type === nodes.ThriftNodeType.Struct || node.type === nodes.ThriftNodeType.Union || node.type === nodes.ThriftNodeType.Exception) {
            members = (node).fields;
        }
        else if (node.type === nodes.ThriftNodeType.Enum) {
            members = (node).members;
        }
        else if (node.type === nodes.ThriftNodeType.Service) {
            members = (node).functions;
        }
        else {
            continue;
        }
        for (const member of members) {
            const memberContainsAll = merged.every(range => (0, line_range_1.rangeContainsLineRange)(member.range, range));
            if (!memberContainsAll) {
                continue;
            }
            const span = member.range.end.line - member.range.start.line;
            if (span < bestSpan) {
                bestSpan = span;
                best = (0, line_range_1.createLineRange)(member.range.start.line, member.range.end.line);
            }
        }
    }
    return best;
}
exports.findBestContainingMemberRangeForChanges = findBestContainingMemberRangeForChanges;
function findContainingNode(ast, targetRange) {
    const normalized = (0, line_range_1.normalizeLineRange)(targetRange);
    if (!normalized) {
        return null;
    }
    let best = null;
    let bestSpan = Number.POSITIVE_INFINITY;
    for (const node of ast.body) {
        if (!(0, line_range_1.rangeContainsLineRange)(node.range, normalized)) {
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
exports.findContainingNode = findContainingNode;
function buildPartialLines(lines, startLine, endLine) {
    return lines.map((line, idx) => (idx >= startLine && idx <= endLine) ? line : '');
}
exports.buildPartialLines = buildPartialLines;
function hashText(text) {
    let hash = 5381;
    for (let i = 0; i < text.length; i++) {
        hash = ((hash << 5) + hash) + text.charCodeAt(i);
        hash |= 0;
    }
    return hash;
}
exports.hashText = hashText;
function filterIssuesByLineRange(issues, lineRange) {
    return issues.filter(issue => (0, line_range_1.rangeIntersectsLineRange)(issue.range, lineRange));
}
exports.filterIssuesByLineRange = filterIssuesByLineRange;
//# sourceMappingURL=utils.js.map