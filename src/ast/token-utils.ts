import {Token, ThriftTokenizer, tokenizeLine} from './tokenizer';

export type TokenWithIndex = Token & { index: number };

export function filterMeaningfulTokens(tokens: Token[]): Token[] {
    return tokens.filter(token => token.type !== 'whitespace' && token.type !== 'comment');
}

export function getMeaningfulTokens(line: string, tokenizer?: ThriftTokenizer): Token[] {
    const tokens = tokenizer ? tokenizer.tokenizeLine(line) : tokenizeLine(line);
    return filterMeaningfulTokens(tokens);
}

export function readQualifiedIdentifier(tokens: Token[], startIndex: number): {
    value: string;
    endIndex: number;
    startOffset: number;
    endOffset: number
} | null {
    const first = tokens[startIndex];
    if (!first || first.type !== 'identifier') {
        return null;
    }
    let value = first.value;
    let endIndex = startIndex + 1;
    let endOffset = first.end;
    while (tokens[endIndex] && tokens[endIndex].type === 'symbol' && tokens[endIndex].value === '.' &&
    tokens[endIndex + 1] && tokens[endIndex + 1].type === 'identifier') {
        value += '.' + tokens[endIndex + 1].value;
        endOffset = tokens[endIndex + 1].end;
        endIndex += 2;
    }
    return {
        value,
        endIndex,
        startOffset: first.start,
        endOffset
    };
}

export function findFirstIdentifier(tokens: Token[], startIndex: number): TokenWithIndex | null {
    for (let i = startIndex; i < tokens.length; i++) {
        if (tokens[i].type === 'identifier') {
            return {...tokens[i], index: i};
        }
    }
    return null;
}

export function findIdentifierIndex(tokens: Token[], value: string, startIndex: number): number {
    for (let i = startIndex; i < tokens.length; i++) {
        if (tokens[i].type === 'identifier' && tokens[i].value === value) {
            return i;
        }
    }
    return -1;
}

export function findLastIdentifier(tokens: Token[], endIndex: number): TokenWithIndex | null {
    for (let i = Math.min(tokens.length, endIndex) - 1; i >= 0; i--) {
        if (tokens[i].type === 'identifier') {
            return {...tokens[i], index: i};
        }
    }
    return null;
}

export function findSymbolIndex(tokens: Token[], value: string): number {
    for (let i = 0; i < tokens.length; i++) {
        if (tokens[i].type === 'symbol' && tokens[i].value === value) {
            return i;
        }
    }
    return -1;
}

export function findSymbolIndexFrom(tokens: Token[], value: string, startIndex: number): number {
    for (let i = startIndex; i < tokens.length; i++) {
        if (tokens[i].type === 'symbol' && tokens[i].value === value) {
            return i;
        }
    }
    return -1;
}
