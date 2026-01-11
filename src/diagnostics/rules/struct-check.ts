import * as vscode from 'vscode';
import * as nodes from '../../ast/nodes.types';
import {ThriftIssue} from '../types';
import {isKnownType, isValidDefaultValue} from './type-utils';

export function checkStruct(
    node: nodes.Struct,
    definedTypes: Set<string>,
    includeAliases: Set<string>,
    issues: ThriftIssue[]
) {
    const fieldIds = new Set<number>();
    for (const field of node.fields) {
        if (fieldIds.has(field.id)) {
            issues.push({
                message: `Duplicate field id ${field.id}`,
                range: field.range,
                severity: vscode.DiagnosticSeverity.Error,
                code: 'field.duplicateId'
            });
        }
        fieldIds.add(field.id);

        if (!isKnownType(field.fieldType, definedTypes, includeAliases)) {
            issues.push({
                message: `Unknown type '${field.fieldType}'`,
                range: field.typeRange || field.range,
                severity: vscode.DiagnosticSeverity.Error,
                code: 'type.unknown'
            });
        }

        if (field.defaultValue && !isValidDefaultValue(field.fieldType, field.defaultValue)) {
            issues.push({
                message: `Invalid default value '${field.defaultValue}' for type '${field.fieldType}'`,
                range: field.defaultValueRange || field.range,
                severity: vscode.DiagnosticSeverity.Warning,
                code: 'value.typeMismatch'
            });
        }
    }
}
