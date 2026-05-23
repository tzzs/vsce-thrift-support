"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkStruct = void 0;
const types_1 = require("../../types");
const type_utils_1 = require("./type-utils");
function checkStruct(node, definedTypes, includeAliases, issues) {
    const fieldIds = new Set();
    for (const field of node.fields) {
        if (fieldIds.has(field.id)) {
            issues.push({
                message: `Duplicate field id ${field.id}`,
                range: field.range,
                severity: types_1.DiagnosticSeverity.Error,
                code: 'field.duplicateId'
            });
        }
        fieldIds.add(field.id);
        if (!(0, type_utils_1.isKnownType)(field.fieldType, definedTypes, includeAliases)) {
            issues.push({
                message: `Unknown type '${field.fieldType}'`,
                range: field.typeRange ?? field.range,
                severity: types_1.DiagnosticSeverity.Error,
                code: 'type.unknown'
            });
        }
        if (typeof field.defaultValue === 'string' && field.defaultValue.length > 0 && !(0, type_utils_1.isValidDefaultValue)(field.fieldType, field.defaultValue)) {
            issues.push({
                message: `Invalid default value '${field.defaultValue}' for type '${field.fieldType}'`,
                range: field.defaultValueRange ?? field.range,
                severity: types_1.DiagnosticSeverity.Warning,
                code: 'value.typeMismatch'
            });
        }
    }
}
exports.checkStruct = checkStruct;
//# sourceMappingURL=struct-check.js.map