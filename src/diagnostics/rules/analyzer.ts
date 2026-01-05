import * as vscode from 'vscode';
import { ThriftParser } from '../../ast/parser';
import * as nodes from '../../ast/nodes.types';
import { collectTypesFromAst } from '../include-resolver';
import { LineRange, normalizeLineRange, rangeIntersectsLineRange } from '../../utils/line-range';
import { stripCommentsFromLine } from '../utils';
import { ThriftIssue } from '../types';
import { collectIncludeAliasesFromAst, AnalysisContext } from './analysis-context';
import {
    getPrimitiveTypes,
    isIntegerLiteral,
    isKnownType,
    isValidDefaultValue,
    resolveNamespacedBase
} from './type-utils';

/**
 * 执行 AST 级别诊断并返回问题列表。
 * @param ast 当前 AST
 * @param lines 文档行内容
 * @param includedTypes include 导入类型集合
 * @param context 分析上下文
 * @param analysisScope 诊断范围（行级）
 * @returns 诊断问题列表
 */
export function analyzeThriftAst(
    ast: nodes.ThriftDocument,
    lines: string[],
    includedTypes?: Map<string, string>,
    context?: AnalysisContext,
    analysisScope?: LineRange
): ThriftIssue[] {
    const issues: ThriftIssue[] = [];
    const primitives = getPrimitiveTypes();

    const codeLines: string[] = [];
    const state = { inBlock: false };
    for (const raw of lines) {
        codeLines.push(stripCommentsFromLine(raw, state));
    }

    const includeAliases = context?.includeAliases ?? collectIncludeAliasesFromAst(ast);
    const typeKind = context?.typeKind
        ? new Map(context.typeKind)
        : collectTypesFromAst(ast);

    if (includedTypes) {
        for (const [name, kind] of includedTypes) {
            if (!typeKind.has(name)) {
                typeKind.set(name, kind);
            }
        }
    }

    const definedTypes = new Set<string>([...typeKind.keys()]);

    /**
     * 定位类型文本在指定行内的范围。
     * @param lineNo 行号
     * @param typeText 类型文本
     * @param fallback 回退范围
     * @returns 类型范围
     */
    const findTypeRange = (lineNo: number, typeText: string, fallback: vscode.Range): vscode.Range => {
        if (lineNo >= 0 && lineNo < lines.length) {
            const idx = lines[lineNo].indexOf(typeText);
            if (idx >= 0) {
                return new vscode.Range(lineNo, idx, lineNo, idx + typeText.length);
            }
        }
        return fallback;
    };

    for (const node of ast.body) {
        if (node.type !== nodes.ThriftNodeType.Service) {
            continue;
        }
        const serviceNode = node as nodes.Service;
        if (!serviceNode.extends) {
            continue;
        }
        const parentName = serviceNode.extends;
        let base = parentName;
        let parentKind = typeKind.get(parentName);
        if (!parentKind && parentName.includes('.')) {
            base = resolveNamespacedBase(parentName, includeAliases) || '';
            parentKind = base ? typeKind.get(base) : undefined;
        }

        const lineNo = serviceNode.range.start.line;
        const lineText = lines[lineNo] || '';
        const col = lineText.indexOf('extends');
        const range = col >= 0
            ? new vscode.Range(lineNo, col, lineNo, col + 'extends'.length)
            : serviceNode.range;

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

    for (const node of ast.body) {
        switch (node.type) {
            case nodes.ThriftNodeType.Typedef: {
                const typedefNode = node as nodes.Typedef;
                const baseType = typedefNode.aliasType.trim();
                if (!isKnownType(baseType, definedTypes, includeAliases) && !primitives.has(baseType)) {
                    const lineNo = typedefNode.range.start.line;
                    issues.push({
                        message: `Unknown base type '${baseType}' in typedef`,
                        range: findTypeRange(lineNo, baseType, typedefNode.range),
                        severity: vscode.DiagnosticSeverity.Error,
                        code: 'typedef.unknownBase'
                    });
                }
                break;
            }
            case nodes.ThriftNodeType.Const: {
                const constNode = node as nodes.Const;
                const constType = constNode.valueType.trim();
                if (!isKnownType(constType, definedTypes, includeAliases)) {
                    const lineNo = constNode.range.start.line;
                    issues.push({
                        message: `Unknown type '${constType}'`,
                        range: findTypeRange(lineNo, constType, constNode.range),
                        severity: vscode.DiagnosticSeverity.Error,
                        code: 'type.unknown'
                    });
                }
                break;
            }
            case nodes.ThriftNodeType.Enum: {
                const enumNode = node as nodes.Enum;
                if (!enumNode.isSenum) {
                    for (const member of enumNode.members) {
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
                break;
            }
            case nodes.ThriftNodeType.Struct:
            case nodes.ThriftNodeType.Union:
            case nodes.ThriftNodeType.Exception: {
                const structNode = node as nodes.Struct;
                const fieldIds = new Set<number>();
                for (const field of structNode.fields) {
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
                break;
            }
            case nodes.ThriftNodeType.Service: {
                const serviceNode = node as nodes.Service;
                for (const fn of serviceNode.functions) {
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
                            range: findTypeRange(lineNo, fn.returnType, fn.range),
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
                break;
            }
            default:
                break;
        }
    }

    const stack: { ch: string; line: number; char: number }[] = [];
    for (let lineNo = 0; lineNo < codeLines.length; lineNo++) {
        const line = codeLines[lineNo];
        let inS = false, inD = false, escaped = false;
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];

            if (inS) {
                if (!escaped && ch === '\\') {
                    escaped = true;
                    continue;
                }
                if (!escaped && ch === '\'') {
                    inS = false;
                }
                escaped = false;
                continue;
            }
            if (inD) {
                if (!escaped && ch === '\\') {
                    escaped = true;
                    continue;
                }
                if (!escaped && ch === '"') {
                    inD = false;
                }
                escaped = false;
                continue;
            }
            if (ch === '\'') {
                inS = true;
                continue;
            }
            if (ch === '"') {
                inD = true;
                continue;
            }

            if (ch === '{' || ch === '(' || ch === '<') {
                stack.push({ ch, line: lineNo, char: i });
            } else if (ch === '}' || ch === ')' || ch === '>') {
                if (ch === '>') {
                    const top = stack[stack.length - 1];
                    if (top && top.ch === '<') {
                        stack.pop();
                    }
                    continue;
                }
                const open = stack.pop();
                if (!open) {
                    issues.push({
                        message: `Unmatched closing '${ch}'`,
                        range: new vscode.Range(lineNo, i, lineNo, i + 1),
                        severity: vscode.DiagnosticSeverity.Error,
                        code: 'syntax.unmatchedCloser'
                    });
                } else {
                    const pair: Record<string, string> = { '}': '{', ')': '(' };
                    if (open.ch !== pair[ch]) {
                        issues.push({
                            message: `Mismatched '${open.ch}' and '${ch}'`,
                            range: new vscode.Range(lineNo, i, lineNo, i + 1),
                            severity: vscode.DiagnosticSeverity.Error,
                            code: 'syntax.mismatched'
                        });
                    }
                }
            }
        }
    }

    for (const open of stack) {
        issues.push({
            message: `Unclosed '${open.ch}'`,
            range: new vscode.Range(open.line, open.char, open.line, open.char + 1),
            severity: vscode.DiagnosticSeverity.Error,
            code: 'syntax.unclosed'
        });
    }

    if (analysisScope) {
        const normalized = normalizeLineRange(analysisScope);
        if (normalized) {
            return issues.filter(issue => rangeIntersectsLineRange(issue.range, normalized));
        }
    }

    return issues;
}

/**
 * 解析文本并执行诊断规则。
 * @param text 文本内容
 * @param uri 文档 URI
 * @param includedTypes include 导入类型集合
 * @returns 诊断问题列表
 */
export function analyzeThriftText(
    text: string,
    uri?: vscode.Uri,
    includedTypes?: Map<string, string>
): ThriftIssue[] {
    const lines = text.split('\n');
    const ast = uri
        ? ThriftParser.parseContentWithCache(uri.toString(), text)
        : new ThriftParser(text).parse();

    return analyzeThriftAst(ast, lines, includedTypes);
}
