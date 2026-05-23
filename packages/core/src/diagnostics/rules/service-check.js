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
exports.checkService = void 0;
const types_1 = require("../../types");
const nodes = __importStar(require("../../ast/nodes.types"));
const type_utils_1 = require("./type-utils");
function checkService(node, lines, definedTypes, includeAliases, typeKind, issues) {
    if (node.type === nodes.ThriftNodeType.Service && node.extends !== undefined) {
        const parentName = node.extends;
        let base = parentName;
        let parentKind = typeKind.get(parentName);
        if (parentKind === undefined && parentName.includes('.')) {
            base = (0, type_utils_1.resolveNamespacedBase)(parentName, includeAliases) ?? '';
            parentKind = typeof base === 'string' && base.length > 0 ? typeKind.get(base) : undefined;
        }
        const lineNo = node.range.start.line;
        const lineText = lines[lineNo] || '';
        const col = lineText.indexOf('extends');
        const range = col >= 0
            ? new types_1.Range(lineNo, col, lineNo, col + 'extends'.length)
            : node.range;
        if (base.length === 0 || parentKind === undefined) {
            issues.push({
                message: `Unknown parent service '${parentName}' in extends`,
                range,
                severity: types_1.DiagnosticSeverity.Error,
                code: 'service.extends.unknown'
            });
        }
        else if (parentKind !== 'service') {
            issues.push({
                message: `Parent type '${parentName}' is not a service`,
                range,
                severity: types_1.DiagnosticSeverity.Error,
                code: 'service.extends.notService'
            });
        }
    }
    for (const fn of node.functions) {
        const fnName = fn.name ?? 'unknown';
        if (fn.oneway && fn.isStream !== true && fn.isSink !== true) {
            if (fn.returnType.trim() !== 'void') {
                issues.push({
                    message: `oneway method '${fnName}' must return void`,
                    range: fn.range,
                    severity: types_1.DiagnosticSeverity.Error,
                    code: 'service.oneway.returnNotVoid'
                });
            }
            if (fn.throws !== undefined && fn.throws.length > 0) {
                issues.push({
                    message: `oneway method '${fnName}' must not declare throws`,
                    range: fn.range,
                    severity: types_1.DiagnosticSeverity.Error,
                    code: 'service.oneway.hasThrows'
                });
            }
        }
        if (!(0, type_utils_1.isKnownType)(fn.returnType, definedTypes, includeAliases)) {
            const lineNo = fn.range.start.line;
            issues.push({
                message: `Unknown return type '${fn.returnType}'`,
                range: findTypeRange(lines, lineNo, fn.returnType, fn.range),
                severity: types_1.DiagnosticSeverity.Error,
                code: 'service.returnType.unknown'
            });
        }
        for (const arg of fn.arguments) {
            if (!(0, type_utils_1.isKnownType)(arg.fieldType, definedTypes, includeAliases)) {
                issues.push({
                    message: `Unknown type '${arg.fieldType}'`,
                    range: arg.typeRange ?? arg.range,
                    severity: types_1.DiagnosticSeverity.Error,
                    code: 'type.unknown'
                });
            }
        }
        for (const thr of fn.throws) {
            const base = (0, type_utils_1.resolveNamespacedBase)(thr.fieldType, includeAliases);
            const kind = typeof base === 'string' && base.length > 0 ? typeKind.get(base) : undefined;
            if (typeof base !== 'string' || base.length === 0 || kind === undefined) {
                issues.push({
                    message: `Unknown exception type '${thr.fieldType}' in throws`,
                    range: thr.range,
                    severity: types_1.DiagnosticSeverity.Error,
                    code: 'service.throws.unknown'
                });
            }
            else if (kind !== 'exception') {
                issues.push({
                    message: `Type '${thr.fieldType}' in throws is not an exception`,
                    range: thr.range,
                    severity: types_1.DiagnosticSeverity.Error,
                    code: 'service.throws.notException'
                });
            }
        }
    }
}
exports.checkService = checkService;
function findTypeRange(lines, lineNo, typeText, fallback) {
    if (lineNo >= 0 && lineNo < lines.length) {
        const idx = lines[lineNo].indexOf(typeText);
        if (idx >= 0) {
            return new types_1.Range(lineNo, idx, lineNo, idx + typeText.length);
        }
    }
    return fallback;
}
//# sourceMappingURL=service-check.js.map