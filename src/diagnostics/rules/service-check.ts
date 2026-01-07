import * as vscode from 'vscode';
import * as nodes from '../../ast/nodes.types';
import { ThriftIssue } from '../types';
import { isKnownType, resolveNamespacedBase } from './type-utils';

export function checkService(
    node: nodes.Service,
    lines: string[],
    definedTypes: Set<string>,
    includeAliases: Set<string>,
    typeKind: Map<string, string>,
    issues: ThriftIssue[]
) {
    // Check extends
    if (node.extends) {
        const parentName = node.extends;
        let base = parentName;
        let parentKind = typeKind.get(parentName);
        if (!parentKind && parentName.includes('.')) {
            base = resolveNamespacedBase(parentName, includeAliases) || '';
            parentKind = base ? typeKind.get(base) : undefined;
        }

        const lineNo = node.range.start.line;
        const lineText = lines[lineNo] || '';
        const col = lineText.indexOf('extends');
        const range = col >= 0
            ? new vscode.Range(lineNo, col, lineNo, col + 'extends'.length)
            : node.range;

        if (!base || !parentKind) {
            issues.push({
                message: `Unknown parent service '${parentName}' in extends`,
                range,
                severity: vscode.DiagnosticSeverity.Error,
                code: 'service.extends.unknown'
            });
        } else if (parentKind !== 'service') {
            issues.push({
                message: `Parent type '${parentName}' is not a service`,
                range,
                severity: vscode.DiagnosticSeverity.Error,
                code: 'service.extends.notService'
            });
        }
    }

    // Check functions
    for (const fn of node.functions) {
        if (fn.oneway) {
            if (fn.returnType.trim() !== 'void') {
                issues.push({
                    message: `oneway method '${fn.name}' must return void`,
                    range: fn.range,
                    severity: vscode.DiagnosticSeverity.Error,
                    code: 'service.oneway.returnNotVoid'
                });
            }
            if (fn.throws && fn.throws.length > 0) {
                issues.push({
                    message: `oneway method '${fn.name}' must not declare throws`,
                    range: fn.range,
                    severity: vscode.DiagnosticSeverity.Error,
                    code: 'service.oneway.hasThrows'
                });
            }
        }
        if (!isKnownType(fn.returnType, definedTypes, includeAliases)) {
            const lineNo = fn.range.start.line;
            issues.push({
                message: `Unknown return type '${fn.returnType}'`,
                range: findTypeRange(lines, lineNo, fn.returnType, fn.range),
                severity: vscode.DiagnosticSeverity.Error,
                code: 'service.returnType.unknown'
            });
        }

        for (const arg of fn.arguments) {
            if (!isKnownType(arg.fieldType, definedTypes, includeAliases)) {
                issues.push({
                    message: `Unknown type '${arg.fieldType}'`,
                    range: arg.typeRange || arg.range,
                    severity: vscode.DiagnosticSeverity.Error,
                    code: 'type.unknown'
                });
            }
        }

        for (const thr of fn.throws) {
            const base = resolveNamespacedBase(thr.fieldType, includeAliases);
            const kind = base ? typeKind.get(base) : undefined;
            if (!base || !kind) {
                issues.push({
                    message: `Unknown exception type '${thr.fieldType}' in throws`,
                    range: thr.range,
                    severity: vscode.DiagnosticSeverity.Error,
                    code: 'service.throws.unknown'
                });
            } else if (kind !== 'exception') {
                issues.push({
                    message: `Type '${thr.fieldType}' in throws is not an exception`,
                    range: thr.range,
                    severity: vscode.DiagnosticSeverity.Error,
                    code: 'service.throws.notException'
                });
            }
        }
    }
}

function findTypeRange(lines: string[], lineNo: number, typeText: string, fallback: vscode.Range): vscode.Range {
    if (lineNo >= 0 && lineNo < lines.length) {
        const idx = lines[lineNo].indexOf(typeText);
        if (idx >= 0) {
            return new vscode.Range(lineNo, idx, lineNo, idx + typeText.length);
        }
    }
    return fallback;
}
