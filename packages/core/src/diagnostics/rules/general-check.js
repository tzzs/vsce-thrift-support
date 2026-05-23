"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkEnum = exports.checkConst = exports.checkTypedef = void 0;
const types_1 = require("../../types");
const type_utils_1 = require("./type-utils");
const primitives = (0, type_utils_1.getPrimitiveTypes)();
function checkTypedef(node, lines, definedTypes, includeAliases, issues) {
    const baseType = node.aliasType.trim();
    if (!(0, type_utils_1.isKnownType)(baseType, definedTypes, includeAliases) && !primitives.has(baseType)) {
        const lineNo = node.range.start.line;
        issues.push({
            message: `Unknown base type '${baseType}' in typedef`,
            range: findTypeRange(lines, lineNo, baseType, node.range),
            severity: types_1.DiagnosticSeverity.Error,
            code: 'typedef.unknownBase'
        });
    }
}
exports.checkTypedef = checkTypedef;
function checkConst(node, lines, definedTypes, includeAliases, issues) {
    const constType = node.valueType.trim();
    if (!(0, type_utils_1.isKnownType)(constType, definedTypes, includeAliases)) {
        const lineNo = node.range.start.line;
        issues.push({
            message: `Unknown type '${constType}'`,
            range: findTypeRange(lines, lineNo, constType, node.range),
            severity: types_1.DiagnosticSeverity.Error,
            code: 'type.unknown'
        });
    }
}
exports.checkConst = checkConst;
function checkEnum(node, issues) {
    if (node.isSenum !== true) {
        for (const member of node.members) {
            if (typeof member.initializer === 'string' && member.initializer.length > 0 && !(0, type_utils_1.isIntegerLiteral)(member.initializer)) {
                issues.push({
                    message: `Enum value must be an integer literal`,
                    range: member.range,
                    severity: types_1.DiagnosticSeverity.Error,
                    code: 'enum.valueNotInteger'
                });
            }
        }
    }
}
exports.checkEnum = checkEnum;
function findTypeRange(lines, lineNo, typeText, fallback) {
    if (lineNo >= 0 && lineNo < lines.length) {
        const idx = lines[lineNo].indexOf(typeText);
        if (idx >= 0) {
            return new types_1.Range(lineNo, idx, lineNo, idx + typeText.length);
        }
    }
    return fallback;
}
//# sourceMappingURL=general-check.js.map