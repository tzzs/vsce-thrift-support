import {DiagnosticSeverity} from '../../types';
import * as nodes from '../../ast/nodes.types';
import {ThriftIssue} from '../types';
import {isKnownType, isValidDefaultValue, resolveMultilineDefaultFromLines} from './type-utils';

export function checkStruct(
    node: nodes.Struct,
    definedTypes: Set<string>,
    includeAliases: Set<string>,
    lines: string[],
    issues: ThriftIssue[]
) {
    const fieldIds = new Set<number>();
    for (const field of node.fields) {
        if (fieldIds.has(field.id)) {
            issues.push({
                message: `Duplicate field id ${field.id}`,
                range: field.range,
                severity: DiagnosticSeverity.Error,
                code: 'field.duplicateId'
            });
        }
        fieldIds.add(field.id);

        if (!isKnownType(field.fieldType, definedTypes, includeAliases)) {
            issues.push({
                message: `Unknown type '${field.fieldType}'`,
                range: field.typeRange ?? field.range,
                severity: DiagnosticSeverity.Error,
                code: 'type.unknown'
            });
        }

        let defaultValue = field.defaultValue;
        if (typeof defaultValue === 'string' && defaultValue.length > 0) {
            // Resolve multi-line default values that were truncated by the single-line parser
            if (defaultValue.startsWith('[') || defaultValue.startsWith('{') || defaultValue.startsWith('(')) {
                const multiline = resolveMultilineDefaultFromLines(lines, field.range.start.line, defaultValue);
                if (multiline !== null) {
                    defaultValue = multiline;
                }
            }
            if (!isValidDefaultValue(field.fieldType, defaultValue)) {
                issues.push({
                    message: `Invalid default value '${defaultValue}' for type '${field.fieldType}'`,
                    range: field.defaultValueRange ?? field.range,
                    severity: DiagnosticSeverity.Warning,
                    code: 'value.typeMismatch'
                });
            }
        }
    }
}
