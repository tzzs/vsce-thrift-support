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
exports.formatChunked = exports.splitIntoChunks = exports.CHUNK_THRESHOLD = void 0;
const parser_1 = require("../ast/parser");
const nodes = __importStar(require("../ast/nodes.types"));
exports.CHUNK_THRESHOLD = 10000;
function splitIntoChunks(content) {
    const lines = content.split('\n');
    if (lines.length <= exports.CHUNK_THRESHOLD) {
        return [{ startLine: 0, endLine: lines.length - 1, text: content }];
    }
    let ast;
    try {
        ast = new parser_1.ThriftParser(content).parse();
    }
    catch {
        return [{ startLine: 0, endLine: lines.length - 1, text: content }];
    }
    const bodyNodes = ast.body.filter(n => n.type !== nodes.ThriftNodeType.Invalid);
    if (bodyNodes.length === 0) {
        return [{ startLine: 0, endLine: lines.length - 1, text: content }];
    }
    const chunks = [];
    let prevEnd = -1;
    for (let i = 0; i < bodyNodes.length; i++) {
        const node = bodyNodes[i];
        const nodeEnd = node.range.end.line;
        const chunkStart = prevEnd + 1;
        const chunkEnd = Math.max(nodeEnd, chunkStart);
        chunks.push({
            startLine: chunkStart,
            endLine: chunkEnd,
            text: lines.slice(chunkStart, chunkEnd + 1).join('\n')
        });
        prevEnd = chunkEnd;
    }
    if (prevEnd < lines.length - 1) {
        const trailingStart = prevEnd + 1;
        const trailingText = lines.slice(trailingStart).join('\n');
        if (trailingText.trim().length > 0) {
            chunks.push({
                startLine: trailingStart,
                endLine: lines.length - 1,
                text: trailingText
            });
        }
    }
    return chunks;
}
exports.splitIntoChunks = splitIntoChunks;
function formatChunked(content, options, formatFn) {
    const chunks = splitIntoChunks(content);
    if (chunks.length <= 1) {
        return formatFn(content, options);
    }
    const formattedChunks = [];
    for (const chunk of chunks) {
        const formatted = formatFn(chunk.text, options);
        formattedChunks.push(formatted);
    }
    return formattedChunks.join('\n');
}
exports.formatChunked = formatChunked;
//# sourceMappingURL=chunked-format.js.map