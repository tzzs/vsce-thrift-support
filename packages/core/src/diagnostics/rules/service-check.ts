import {Range, DiagnosticSeverity} from '../../types';
import * as nodes from '../../ast/nodes.types';
import {ThriftIssue} from '../types';
import {isKnownType, resolveNamespacedBase} from './type-utils';
import {DIAGNOSTIC_CODES} from '../diagnostic-codes';

export function checkService(
    node: nodes.Service | nodes.Interaction,
    lines: string[],
    definedTypes: Set<string>,
    includeAliases: Set<string>,
    typeKind: Map<string, string>,
    issues: ThriftIssue[]
) {
    // Check extends (services only)
    if (node.type === nodes.ThriftNodeType.Service && node.extends !== undefined) {
        const parentName = node.extends;
        let base = parentName;
        let parentKind = typeKind.get(parentName);
        if (parentKind === undefined && parentName.includes('.')) {
            base = resolveNamespacedBase(parentName, includeAliases) ?? '';
            parentKind = typeof base === 'string' && base.length > 0 ? typeKind.get(base) : undefined;
        }

        const lineNo = node.range.start.line;
        const lineText = lines[lineNo] || '';
        const col = lineText.indexOf('extends');
        const range = col >= 0
            ? new Range(lineNo, col, lineNo, col + 'extends'.length)
            : node.range;

        if (base.length === 0 || parentKind === undefined) {
            issues.push({
                message: `Unknown parent service '${parentName}' in extends`,
                range,
                severity: DiagnosticSeverity.Error,
                code: DIAGNOSTIC_CODES.SERVICE_EXTENDS_UNKNOWN
            });
        } else if (parentKind !== 'service') {
            issues.push({
                message: `Parent type '${parentName}' is not a service`,
                range,
                severity: DiagnosticSeverity.Error,
                code: DIAGNOSTIC_CODES.SERVICE_EXTENDS_NOT_SERVICE
            });
        }
    }

    // Check functions
    for (const fn of node.functions) {
        const fnName = fn.name ?? 'unknown';
        // stream/sink functions are inherently not oneway
        if (fn.oneway && fn.isStream !== true && fn.isSink !== true) {
            if (fn.returnType.trim() !== 'void') {
                issues.push({
                    message: `oneway method '${fnName}' must return void`,
                    range: fn.range,
                    severity: DiagnosticSeverity.Error,
                    code: DIAGNOSTIC_CODES.SERVICE_ONEWAY_RETURN_NOT_VOID
                });
            }
            if (fn.throws !== undefined && fn.throws.length > 0) {
                issues.push({
                    message: `oneway method '${fnName}' must not declare throws`,
                    range: fn.range,
                    severity: DiagnosticSeverity.Error,
                    code: DIAGNOSTIC_CODES.SERVICE_ONEWAY_HAS_THROWS
                });
            }
        }
        if (!isKnownType(fn.returnType, definedTypes, includeAliases)) {
            const lineNo = fn.range.start.line;
            issues.push({
                message: `Unknown return type '${fn.returnType}'`,
                range: findTypeRange(lines, lineNo, fn.returnType, fn.range),
                severity: DiagnosticSeverity.Error,
                code: DIAGNOSTIC_CODES.SERVICE_RETURN_TYPE_UNKNOWN
            });
        }

        for (const arg of fn.arguments) {
            if (!isKnownType(arg.fieldType, definedTypes, includeAliases)) {
                issues.push({
                    message: `Unknown type '${arg.fieldType}'`,
                    range: arg.typeRange ?? arg.range,
                    severity: DiagnosticSeverity.Error,
                    code: DIAGNOSTIC_CODES.TYPE_UNKNOWN
                });
            }
        }

        for (const thr of fn.throws) {
            const base = resolveNamespacedBase(thr.fieldType, includeAliases);
            const kind = typeof base === 'string' && base.length > 0 ? typeKind.get(base) : undefined;
            if (typeof base !== 'string' || base.length === 0 || kind === undefined) {
                issues.push({
                    message: `Unknown exception type '${thr.fieldType}' in throws`,
                    range: thr.range,
                    severity: DiagnosticSeverity.Error,
                    code: DIAGNOSTIC_CODES.SERVICE_THROWS_UNKNOWN
                });
            } else if (kind !== 'exception') {
                issues.push({
                    message: `Type '${thr.fieldType}' in throws is not an exception`,
                    range: thr.range,
                    severity: DiagnosticSeverity.Error,
                    code: DIAGNOSTIC_CODES.SERVICE_THROWS_NOT_EXCEPTION
                });
            }
        }
    }
}

function findTypeRange(lines: string[], lineNo: number, typeText: string, fallback: Range): Range {
    if (lineNo >= 0 && lineNo < lines.length) {
        const idx = lines[lineNo].indexOf(typeText);
        if (idx >= 0) {
            return new Range(lineNo, idx, lineNo, idx + typeText.length);
        }
    }
    return fallback;
}
