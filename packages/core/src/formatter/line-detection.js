"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isAnnotationStartLine = exports.isInteractionStartLine = exports.isServiceStartLine = exports.isEnumStartLine = exports.isStructStartLine = void 0;
function isStructStartLine(line) {
    return /^(struct|union|exception)\b/.test(line) && line.includes('{') && !line.includes('}');
}
exports.isStructStartLine = isStructStartLine;
function isEnumStartLine(line) {
    return /^(enum|senum)\b/.test(line) && line.includes('{') && !line.includes('}');
}
exports.isEnumStartLine = isEnumStartLine;
function isServiceStartLine(line) {
    return /^service\b/.test(line) && line.includes('{') && !line.includes('}');
}
exports.isServiceStartLine = isServiceStartLine;
function isInteractionStartLine(line) {
    return /^interaction\b/.test(line) && line.includes('{') && !line.includes('}');
}
exports.isInteractionStartLine = isInteractionStartLine;
function isAnnotationStartLine(line) {
    return /^\s*@[A-Za-z_][A-Za-z0-9_]*\s*\{/.test(line) && !line.includes('}');
}
exports.isAnnotationStartLine = isAnnotationStartLine;
//# sourceMappingURL=line-detection.js.map