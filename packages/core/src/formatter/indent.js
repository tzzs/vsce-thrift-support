"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getServiceIndent = exports.getIndent = void 0;
function getIndent(level, options) {
    const indentSize = options.indentSize || 2;
    if (options.insertSpaces) {
        return ' '.repeat(level * indentSize);
    }
    return '\t'.repeat(level);
}
exports.getIndent = getIndent;
function getServiceIndent(level, options) {
    return getIndent(level, options);
}
exports.getServiceIndent = getServiceIndent;
//# sourceMappingURL=indent.js.map