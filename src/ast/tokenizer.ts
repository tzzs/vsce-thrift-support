export type TokenType = 'identifier' | 'number' | 'string' | 'symbol' | 'whitespace' | 'comment';

export interface Token {
    type: TokenType;
    value: string;
    start: number;
    end: number;
}

const symbolChars = new Set(['{', '}', '(', ')', '[', ']', '<', '>', ',', ';', ':', '=', '.']);

/**
 * Tokenize a single line of Thrift source.
 * @param line - Line content.
 * @returns Tokens found in the line.
 */
export function tokenizeLine(line: string): Token[] {
    const tokens: Token[] = [];
    let i = 0;
    while (i < line.length) {
        const ch = line[i];

        if (ch === ' ' || ch === '\t') {
            const start = i;
            while (i < line.length && (line[i] === ' ' || line[i] === '\t')) {
                i += 1;
            }
            tokens.push({type: 'whitespace', value: line.slice(start, i), start, end: i});
            continue;
        }

        if (ch === '/' && line[i + 1] === '/') {
            tokens.push({type: 'comment', value: line.slice(i), start: i, end: line.length});
            break;
        }
        if (ch === '#') {
            tokens.push({type: 'comment', value: line.slice(i), start: i, end: line.length});
            break;
        }

        if (ch === '"' || ch === '\'') {
            const quote = ch;
            const start = i;
            let value = '';
            i += 1;
            let escaped = false;
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
            tokens.push({type: 'string', value, start, end: i});
            continue;
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
            tokens.push({type: 'identifier', value: line.slice(start, i), start, end: i});
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
            tokens.push({type: 'number', value: line.slice(start, i), start, end: i});
            continue;
        }

        if (symbolChars.has(ch)) {
            tokens.push({type: 'symbol', value: ch, start: i, end: i + 1});
            i += 1;
            continue;
        }

        tokens.push({type: 'symbol', value: ch, start: i, end: i + 1});
        i += 1;
    }
    return tokens;
}

/**
 * Tokenize multi-line Thrift text with absolute offsets.
 * @param text - Text content.
 * @returns Tokens found in the text.
 */
export function tokenizeText(text: string): Token[] {
    const tokens: Token[] = [];
    let lineStart = 0;
    for (let i = 0; i <= text.length; i++) {
        if (i === text.length || text[i] === '\n') {
            const line = text.slice(lineStart, i);
            const lineTokens = tokenizeLine(line);
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
