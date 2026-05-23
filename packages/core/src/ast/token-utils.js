"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.findSymbolIndexFrom = exports.findSymbolIndex = exports.findLastIdentifier = exports.findIdentifierIndex = exports.findFirstIdentifier = exports.readQualifiedIdentifier = exports.getMeaningfulTokens = exports.filterMeaningfulTokens = void 0;
const tokenizer_1 = require("./tokenizer");
function filterMeaningfulTokens(tokens) {
    return tokens.filter(token => token.type !== 'whitespace' && token.type !== 'comment');
}
exports.filterMeaningfulTokens = filterMeaningfulTokens;
function getMeaningfulTokens(line, tokenizer) {
    const tokens = tokenizer ? tokenizer.tokenizeLine(line) : (0, tokenizer_1.tokenizeLine)(line);
    return filterMeaningfulTokens(tokens);
}
exports.getMeaningfulTokens = getMeaningfulTokens;
function readQualifiedIdentifier(tokens, startIndex) {
    const first = tokens[startIndex];
    if (first === undefined || first.type !== 'identifier') {
        return null;
    }
    let value = first.value;
    let endIndex = startIndex + 1;
    let endOffset = first.end;
    while (tokens[endIndex] !== undefined && tokens[endIndex].type === 'symbol' && tokens[endIndex].value === '.' &&
        tokens[endIndex + 1] !== undefined && tokens[endIndex + 1].type === 'identifier') {
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
exports.readQualifiedIdentifier = readQualifiedIdentifier;
function findFirstIdentifier(tokens, startIndex) {
    for (let i = startIndex; i < tokens.length; i++) {
        if (tokens[i].type === 'identifier') {
            return { ...tokens[i], index: i };
        }
    }
    return null;
}
exports.findFirstIdentifier = findFirstIdentifier;
function findIdentifierIndex(tokens, value, startIndex) {
    for (let i = startIndex; i < tokens.length; i++) {
        if (tokens[i].type === 'identifier' && tokens[i].value === value) {
            return i;
        }
    }
    return -1;
}
exports.findIdentifierIndex = findIdentifierIndex;
function findLastIdentifier(tokens, endIndex) {
    for (let i = Math.min(tokens.length, endIndex) - 1; i >= 0; i--) {
        if (tokens[i].type === 'identifier') {
            return { ...tokens[i], index: i };
        }
    }
    return null;
}
exports.findLastIdentifier = findLastIdentifier;
function findSymbolIndex(tokens, value) {
    for (let i = 0; i < tokens.length; i++) {
        if (tokens[i].type === 'symbol' && tokens[i].value === value) {
            return i;
        }
    }
    return -1;
}
exports.findSymbolIndex = findSymbolIndex;
function findSymbolIndexFrom(tokens, value, startIndex) {
    for (let i = startIndex; i < tokens.length; i++) {
        if (tokens[i].type === 'symbol' && tokens[i].value === value) {
            return i;
        }
    }
    return -1;
}
exports.findSymbolIndexFrom = findSymbolIndexFrom;
//# sourceMappingURL=token-utils.js.map