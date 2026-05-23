"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isServiceMethodLine = void 0;
function isServiceMethodLine(line) {
    return /^\s*((?:oneway\s+)?[A-Za-z_][A-Za-z0-9_]*(?:\s*<(?:[^<>]|<[^<>]*>)*>)?\s+[A-Za-z_][A-Za-z0-9_]*\s*\([^)]*\)(\s*throws\s*\([^)]*\))?|performs\s+[A-Za-z_][A-Za-z0-9_]*\s+[A-Za-z_][A-Za-z0-9_]*)\s*[;,]?$/.test(line);
}
exports.isServiceMethodLine = isServiceMethodLine;
//# sourceMappingURL=service-method.js.map