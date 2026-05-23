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
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseFieldList = void 0;
const types_1 = require("../types");
const factory_1 = require("./factory");
const tokenizer_1 = require("./tokenizer");
const text_utils_1 = require("./text-utils");
const ranges_1 = require("./ranges");
__exportStar(require("./text-utils"), exports);
__exportStar(require("./ranges"), exports);
function parseFieldList(text, baseLine, baseChar) {
    const fields = [];
    const segments = (0, text_utils_1.splitTopLevelCommasWithOffsets)(text);
    for (const seg of segments) {
        const leading = seg.text.match(/^\s*/)?.[0].length ?? 0;
        const segmentText = (0, text_utils_1.stripLineComments)(seg.text).trim();
        if (!segmentText) {
            continue;
        }
        const segmentStart = seg.start + leading;
        const segmentEnd = segmentStart + segmentText.length;
        const tokens = (0, tokenizer_1.tokenizeText)(segmentText).filter(token => token.type !== 'whitespace' && token.type !== 'comment');
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
        let requiredness;
        if (tokens[cursor]?.type === 'identifier' &&
            (tokens[cursor].value === 'required' || tokens[cursor].value === 'optional')) {
            requiredness = tokens[cursor].value;
            cursor += 1;
        }
        const typeStartToken = tokens[cursor];
        if (typeStartToken === undefined) {
            continue;
        }
        let nameTokenIndex = -1;
        let angleDepth = 0;
        for (let i = cursor; i < tokens.length; i++) {
            const token = tokens[i];
            if (token.type === 'symbol') {
                if (token.value === '<') {
                    angleDepth += 1;
                }
                else if (token.value === '>') {
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
        const defaultInfo = (0, ranges_1.findDefaultValueRange)(segmentText);
        const startPos = (0, text_utils_1.offsetToPosition)(text, baseLine, baseChar, segmentStart);
        const endPos = (0, text_utils_1.offsetToPosition)(text, baseLine, baseChar, segmentEnd);
        const nameStart = (0, text_utils_1.offsetToPosition)(text, baseLine, baseChar, segmentStart + nameToken.start);
        const nameEnd = (0, text_utils_1.offsetToPosition)(text, baseLine, baseChar, segmentStart + nameToken.end);
        const typeStart = (0, text_utils_1.offsetToPosition)(text, baseLine, baseChar, segmentStart + typeStartToken.start);
        const typeEnd = (0, text_utils_1.offsetToPosition)(text, baseLine, baseChar, segmentStart + nameToken.start);
        const defaultStart = defaultInfo ? (0, text_utils_1.offsetToPosition)(text, baseLine, baseChar, segmentStart + defaultInfo.start) : null;
        const defaultEnd = defaultInfo ? (0, text_utils_1.offsetToPosition)(text, baseLine, baseChar, segmentStart + defaultInfo.end) : null;
        const field = (0, factory_1.createField)({
            range: new types_1.Range(startPos.line, startPos.char, endPos.line, endPos.char),
            nameRange: new types_1.Range(nameStart.line, nameStart.char, nameEnd.line, nameEnd.char),
            typeRange: new types_1.Range(typeStart.line, typeStart.char, typeEnd.line, typeEnd.char),
            id: parseInt(tokens[idIndex].value, 10),
            requiredness: requiredness ?? 'required',
            fieldType,
            name: nameToken.value,
            defaultValue: defaultInfo?.value,
            defaultValueRange: defaultStart && defaultEnd ? new types_1.Range(defaultStart.line, defaultStart.char, defaultEnd.line, defaultEnd.char) : undefined
        });
        fields.push(field);
    }
    return fields;
}
exports.parseFieldList = parseFieldList;
//# sourceMappingURL=parser-helpers.js.map