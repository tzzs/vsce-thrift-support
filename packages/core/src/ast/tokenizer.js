"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tokenizeText = exports.tokenizeLine = exports.ThriftTokenizer = void 0;
const symbolChars = new Set(['{', '}', '(', ')', '[', ']', '<', '>', ',', ';', ':', '=', '.']);
class ThriftTokenizer {
    state = { inBlockComment: false };
    scanLine(line) {
        return scanLine(line, this.state);
    }
    tokenizeLine(line) {
        return this.scanLine(line).tokens;
    }
}
exports.ThriftTokenizer = ThriftTokenizer;
function tokenizeLine(line) {
    return scanLine(line, { inBlockComment: false }).tokens;
}
exports.tokenizeLine = tokenizeLine;
function scanLine(line, state) {
    const tokens = [];
    const stripped = line.split('');
    let i = 0;
    let escaped = false;
    const maskRange = (start, end) => {
        for (let idx = start; idx < end && idx < stripped.length; idx++) {
            stripped[idx] = ' ';
        }
    };
    while (i < line.length) {
        if (state.inBlockComment) {
            const end = line.indexOf('*/', i);
            if (end === -1) {
                tokens.push({ type: 'comment', value: line.slice(i), start: i, end: line.length });
                maskRange(i, line.length);
                i = line.length;
                break;
            }
            const endIndex = end + 2;
            tokens.push({ type: 'comment', value: line.slice(i, endIndex), start: i, end: endIndex });
            maskRange(i, endIndex);
            i = endIndex;
            state.inBlockComment = false;
            continue;
        }
        const ch = line[i];
        if (ch === ' ' || ch === '\t') {
            const start = i;
            while (i < line.length && (line[i] === ' ' || line[i] === '\t')) {
                i += 1;
            }
            tokens.push({ type: 'whitespace', value: line.slice(start, i), start, end: i });
            continue;
        }
        if (ch === '"' || ch === '\'') {
            const quote = ch;
            const start = i;
            let value = '';
            i += 1;
            escaped = false;
            while (i < line.length) {
                const curr = line[i];
                if (!escaped && curr === '\\') {
                    escaped = true;
                    value += curr;
                    i += 1;
                    continue;
                }
                if (!escaped && curr === quote) {
                    i += 1;
                    break;
                }
                escaped = false;
                value += curr;
                i += 1;
            }
            tokens.push({ type: 'string', value, start, end: i });
            continue;
        }
        if (ch === '/' && line[i + 1] === '*') {
            const start = i;
            const end = line.indexOf('*/', i + 2);
            if (end === -1) {
                tokens.push({ type: 'comment', value: line.slice(start), start, end: line.length });
                maskRange(start, line.length);
                state.inBlockComment = true;
                break;
            }
            const endIndex = end + 2;
            tokens.push({ type: 'comment', value: line.slice(start, endIndex), start, end: endIndex });
            maskRange(start, endIndex);
            i = endIndex;
            continue;
        }
        if (ch === '/' && line[i + 1] === '/') {
            tokens.push({ type: 'comment', value: line.slice(i), start: i, end: line.length });
            maskRange(i, line.length);
            break;
        }
        if (ch === '#') {
            tokens.push({ type: 'comment', value: line.slice(i), start: i, end: line.length });
            maskRange(i, line.length);
            break;
        }
        if ((ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z') || ch === '_') {
            const start = i;
            i += 1;
            while (i < line.length) {
                const next = line[i];
                if ((next >= 'A' && next <= 'Z') || (next >= 'a' && next <= 'z') || (next >= '0' && next <= '9') || next === '_') {
                    i += 1;
                    continue;
                }
                break;
            }
            tokens.push({ type: 'identifier', value: line.slice(start, i), start, end: i });
            continue;
        }
        if (ch >= '0' && ch <= '9') {
            const start = i;
            i += 1;
            while (i < line.length) {
                const next = line[i];
                if (next >= '0' && next <= '9') {
                    i += 1;
                    continue;
                }
                break;
            }
            tokens.push({ type: 'number', value: line.slice(start, i), start, end: i });
            continue;
        }
        if (symbolChars.has(ch)) {
            tokens.push({ type: 'symbol', value: ch, start: i, end: i + 1 });
            i += 1;
            continue;
        }
        tokens.push({ type: 'symbol', value: ch, start: i, end: i + 1 });
        i += 1;
    }
    return { tokens, stripped: stripped.join('') };
}
function tokenizeText(text) {
    const tokens = [];
    const tokenizer = new ThriftTokenizer();
    let lineStart = 0;
    for (let i = 0; i <= text.length; i++) {
        if (i === text.length || text[i] === '\n') {
            const line = text.slice(lineStart, i);
            const lineTokens = tokenizer.tokenizeLine(line);
            for (const token of lineTokens) {
                tokens.push({
                    ...token,
                    start: token.start + lineStart,
                    end: token.end + lineStart
                });
            }
            if (i < text.length) {
                tokens.push({
                    type: 'whitespace',
                    value: '\n',
                    start: i,
                    end: i + 1
                });
            }
            lineStart = i + 1;
        }
    }
    return tokens;
}
exports.tokenizeText = tokenizeText;
//# sourceMappingURL=tokenizer.js.map