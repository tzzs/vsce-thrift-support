import {Range, DiagnosticSeverity} from '../../types';
import * as nodes from '../../ast/nodes.types';
import {ThriftIssue} from '../types';
import {getPrimitiveTypes, isIntegerLiteral, isKnownType} from './type-utils';
import {DIAGNOSTIC_CODES} from '../diagnostic-codes';

const primitives = getPrimitiveTypes();

export function checkTypedef(
    node: nodes.Typedef,
    lines: string[],
    definedTypes: Set<string>,
    includeAliases: Set<string>,
    issues: ThriftIssue[]
) {
    const baseType = node.aliasType.trim();
    if (!isKnownType(baseType, definedTypes, includeAliases) && !primitives.has(baseType)) {
        const lineNo = node.range.start.line;
        issues.push({
            message: `Unknown base type '${baseType}' in typedef`,
            range: findTypeRange(lines, lineNo, baseType, node.range),
            severity: DiagnosticSeverity.Error,
            code: DIAGNOSTIC_CODES.TYPEDEF_UNKNOWN_BASE
        });
    }
}

export function checkConst(
    node: nodes.Const,
    lines: string[],
    definedTypes: Set<string>,
    includeAliases: Set<string>,
    issues: ThriftIssue[]
) {
    const constType = node.valueType.trim();
    if (!isKnownType(constType, definedTypes, includeAliases)) {
        const lineNo = node.range.start.line;
        issues.push({
            message: `Unknown type '${constType}'`,
            range: findTypeRange(lines, lineNo, constType, node.range),
            severity: DiagnosticSeverity.Error,
            code: DIAGNOSTIC_CODES.TYPE_UNKNOWN
        });
    }
}

export function checkEnum(node: nodes.Enum, issues: ThriftIssue[]) {
    if (node.isSenum !== true) {
        for (const member of node.members) {
            if (typeof member.initializer !== 'string' || member.initializer.length === 0) {
                continue;
            }
            if (!isIntegerLiteral(member.initializer)) {
                issues.push({
                    message: `Enum value must be an integer literal`,
                    range: member.range,
                    severity: DiagnosticSeverity.Error,
                    code: DIAGNOSTIC_CODES.ENUM_VALUE_NOT_INTEGER
                });
                continue;
            }
            if (member.initializer.trim().startsWith('-')) {
                issues.push({
                    message: `Enum value must be non-negative`,
                    range: member.range,
                    severity: DiagnosticSeverity.Error,
                    code: DIAGNOSTIC_CODES.ENUM_NEGATIVE_VALUE
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
