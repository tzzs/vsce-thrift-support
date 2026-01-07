import * as vscode from 'vscode';
import * as nodes from '../../ast/nodes.types';
import { ThriftIssue } from '../types';
import { getPrimitiveTypes, isIntegerLiteral, isKnownType } from './type-utils';

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
            severity: vscode.DiagnosticSeverity.Error,
            code: 'typedef.unknownBase'
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
            severity: vscode.DiagnosticSeverity.Error,
            code: 'type.unknown'
        });
    }
}

export function checkEnum(node: nodes.Enum, issues: ThriftIssue[]) {
    if (!node.isSenum) {
        for (const member of node.members) {
            if (member.initializer && !isIntegerLiteral(member.initializer)) {
                issues.push({
                    message: `Enum value must be an integer literal`,
                    range: member.range,
                    severity: vscode.DiagnosticSeverity.Error,
                    code: 'enum.valueNotInteger'
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
