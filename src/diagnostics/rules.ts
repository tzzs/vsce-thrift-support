import * as path from 'path';
import * as vscode from 'vscode';
import { ThriftParser } from '../ast/parser';
import * as nodes from '../ast/nodes.types';
import { collectTypesFromAst } from './include-resolver';
import { LineRange, normalizeLineRange, rangeIntersectsLineRange } from '../utils/line-range';
import { stripCommentsFromLine } from './utils';
import { ThriftIssue } from './types';

const PRIMITIVES = new Set<string>([
    'void', 'bool', 'byte', 'i8', 'i16', 'i32', 'i64', 'double', 'string', 'binary', 'uuid', 'slist'
]);

const integerTypes = new Set<string>(['byte', 'i8', 'i16', 'i32', 'i64']);
const uuidRegex = /^[0-9a-fA-F]{8}-([0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}$/;

/**
 * 判断类型文本是否为有效的容器类型定义。
 */
function parseContainerType(typeText: string): boolean {
    const noSpace = typeText.replace(/\s+/g, '');
    if (/^list<.*>$/.test(noSpace)) {
        const inner = typeText.slice(typeText.indexOf('<') + 1, typeText.lastIndexOf('>'));
        return inner.trim().length > 0;
    }
    if (/^set<.*>$/.test(noSpace)) {
        const inner = typeText.slice(typeText.indexOf('<') + 1, typeText.lastIndexOf('>'));
        return inner.trim().length > 0;
    }
    if (/^map<.*>$/.test(noSpace)) {
        const inner = typeText.slice(typeText.indexOf('<') + 1, typeText.lastIndexOf('>'));
        const parts = splitTopLevelAngles(inner);
        return parts.length === 2;
    }
    return false;
}

/**
 * 按顶层泛型深度拆分类型参数列表。
 */
function splitTopLevelAngles(typeInner: string): string[] {
    const parts: string[] = [];
    let buf = '';
    let depth = 0;
    for (let i = 0; i < typeInner.length; i++) {
        const ch = typeInner[i];
        if (ch === '<') {
            depth++;
        }
        if (ch === '>') {
            depth = Math.max(0, depth - 1);
        }
        if (ch === ',' && depth === 0) {
            parts.push(buf);
            buf = '';
        } else {
            buf += ch;
        }
    }
    if (buf) {
        parts.push(buf);
    }
    return parts.map(s => s.trim()).filter(Boolean);
}

/**
 * 移除类型注解（如 `(go.tag="...")`）并保留类型主体。
 */
function stripTypeAnnotations(typeText: string): string {
    let out = '';
    let inSingle = false;
    let inDouble = false;
    let escaped = false;
    let parenDepth = 0;

    for (let i = 0; i < typeText.length; i++) {
        const ch = typeText[i];

        if (parenDepth > 0) {
            if (!escaped && ch === '\\') {
                escaped = true;
                continue;
            }
            if (!escaped) {
                if (ch === '"' && !inSingle) {
                    inDouble = !inDouble;
                    continue;
                }
                if (ch === '\'' && !inDouble) {
                    inSingle = !inSingle;
                    continue;
                }
            } else {
                escaped = false;
                continue;
            }
        }

        if (!inSingle && !inDouble) {
            if (ch === '(') {
                parenDepth++;
                continue;
            }
            if (ch === ')') {
                if (parenDepth > 0) {
                    parenDepth--;
                    continue;
                }
            }
        }

        if (parenDepth === 0) {
            if (!escaped && ch === '\\') {
                escaped = true;
                out += ch;
                continue;
            }
            if (!escaped) {
                if (ch === '"' && !inSingle) {
                    inDouble = !inDouble;
                } else if (ch === '\'' && !inDouble) {
                    inSingle = !inSingle;
                }
                out += ch;
            } else {
                out += ch;
                escaped = false;
            }
        }
    }

    return out.trim();
}

/**
 * 判断类型是否已定义或属于基础类型（含容器/命名空间类型）。
 */
function isKnownType(typeName: string, definedTypes: Set<string>, includeAliases: Set<string>): boolean {
    if (!typeName) {
        return false;
    }
    const t = stripTypeAnnotations(typeName).trim();
    if (PRIMITIVES.has(t)) {
        return true;
    }
    if (definedTypes.has(t)) {
        return true;
    }
    const namespaced = t.match(/^([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)$/);
    if (namespaced) {
        const alias = namespaced[1];
        const base = namespaced[2];
        if (!includeAliases.has(alias)) {
            return false;
        }
        return PRIMITIVES.has(base) || definedTypes.has(base);
    }
    if (parseContainerType(t)) {
        const inner = t.slice(t.indexOf('<') + 1, t.lastIndexOf('>'));
        const parts = splitTopLevelAngles(inner);
        return parts.every(p => isKnownType(p, definedTypes, includeAliases));
    }
    return false;
}

/**
 * 解析 `ns.Type` 形式的真实类型名，校验 include alias 合法性。
 */
function resolveNamespacedBase(typeName: string, includeAliases: Set<string>): string | null {
    if (!typeName.includes('.')) {
        return typeName;
    }
    const parts = typeName.split('.');
    const alias = parts[0];
    if (!alias || !includeAliases.has(alias)) {
        return null;
    }
    return parts[parts.length - 1] || null;
}

/**
 * 判断字符串是否为合法整数文本。
 */
function isIntegerLiteral(text: string): boolean {
    const t = text.trim();
    return /^-?\d+$/.test(t) && !/^-?\d+\.\d+$/.test(t);
}

/**
 * 判断字符串是否为合法浮点文本。
 */
function isFloatLiteral(text: string): boolean {
    const t = text.trim();
    return /^-?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(t);
}

/**
 * 判断字符串是否为引号包裹的字面量。
 */
function isQuotedString(text: string): boolean {
    const t = text.trim();
    if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
        return t.length >= 2;
    }
    return false;
}

/**
 * 从注释剔除后的字段行中解析默认值表达式。
 */
function extractDefaultValue(codeLine: string): string | null {
    let depthAngle = 0, depthBracket = 0, depthBrace = 0, depthParen = 0;
    let inS = false, inD = false, escaped = false;
    let eq = -1;
    for (let i = 0; i < codeLine.length; i++) {
        const ch = codeLine[i];
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
        if (ch === '<') {
            depthAngle++;
        } else if (ch === '>') {
            depthAngle = Math.max(0, depthAngle - 1);
        } else if (ch === '[') {
            depthBracket++;
        } else if (ch === ']') {
            depthBracket = Math.max(0, depthBracket - 1);
        } else if (ch === '{') {
            depthBrace++;
        } else if (ch === '}') {
            depthBrace = Math.max(0, depthBrace - 1);
        } else if (ch === '(') {
            depthParen++;
        } else if (ch === ')') {
            depthParen = Math.max(0, depthParen - 1);
        } else if (ch === '=' && depthAngle === 0 && depthBracket === 0 && depthBrace === 0 && depthParen === 0) {
            eq = i;
            break;
        }
    }
    if (eq === -1) {
        return null;
    }

    let i = eq + 1;
    depthAngle = depthBracket = depthBrace = depthParen = 0;
    inS = inD = false;
    escaped = false;
    let buf = '';
    const n = codeLine.length;
    while (i < n) {
        const ch = codeLine[i];
        if (inS) {
            buf += ch;
            if (!escaped && ch === '\\') {
                escaped = true;
                i++;
                continue;
            }
            if (!escaped && ch === '\'') {
                inS = false;
            }
            escaped = false;
            i++;
            continue;
        }
        if (inD) {
            buf += ch;
            if (!escaped && ch === '\\') {
                escaped = true;
                i++;
                continue;
            }
            if (!escaped && ch === '"') {
                inD = false;
            }
            escaped = false;
            i++;
            continue;
        }
        if (ch === '\'') {
            inS = true;
            buf += ch;
            i++;
            continue;
        }
        if (ch === '"') {
            inD = true;
            buf += ch;
            i++;
            continue;
        }

        if (ch === '<') {
            depthAngle++;
        } else if (ch === '>') {
            depthAngle = Math.max(0, depthAngle - 1);
        } else if (ch === '[') {
            depthBracket++;
        } else if (ch === ']') {
            depthBracket = Math.max(0, depthBracket - 1);
        } else if (ch === '{') {
            depthBrace++;
        } else if (ch === '}') {
            depthBrace = Math.max(0, depthBrace - 1);
        } else if (ch === '(' && depthAngle === 0 && depthBracket === 0 && depthBrace === 0 && depthParen === 0) {
            break;
        } else if (ch === '(') {
            depthParen++;
        } else if (ch === ')') {
            depthParen = Math.max(0, depthParen - 1);
        }

        if ((ch === ',' || ch === ';') && depthAngle === 0 && depthBracket === 0 && depthBrace === 0 && depthParen === 0) {
            break;
        }

        buf += ch;
        i++;
    }
    return buf.trim();
}

/**
 * 根据字段类型判断默认值文本是否合法。
 */
function valueMatchesType(valueRaw: string, typeText: string): boolean {
    const t = stripTypeAnnotations(typeText).trim();
    const v = valueRaw.trim();

    if (integerTypes.has(t)) {
        return isIntegerLiteral(v);
    }
    if (t === 'double') {
        return isIntegerLiteral(v) || isFloatLiteral(v);
    }
    if (t === 'bool') {
        return v === 'true' || v === 'false';
    }
    if (t === 'string' || t === 'binary') {
        return isQuotedString(v);
    }
    if (t === 'uuid') {
        if (!isQuotedString(v)) {
            return false;
        }
        const inner = v.slice(1, -1);
        return uuidRegex.test(inner);
    }
    if (/^list<.+>$/.test(t)) {
        if (!(v.startsWith('[') && v.endsWith(']'))) {
            return false;
        }
        const inner = v.slice(1, -1).trim();
        if (inner.length === 0) {
            return true;
        }
        return true;
    }
    if (/^set<.+>$/.test(t)) {
        return true;
    }
    if (/^map<.+>$/.test(t)) {
        return true;
    }

    return true;
}

/**
 * 检查默认值是否满足字段类型约束。
 */
function isValidDefaultValue(typeText: string, valueText: string): boolean {
    const value = valueText.trim();
    if (!value) {
        return true;
    }
    return valueMatchesType(value, typeText);
}

export interface AnalysisContext {
    includeAliases: Set<string>;
    typeKind: Map<string, string>;
}

/**
 * 提取 include 别名集合，用于命名空间类型解析。
 */
export function collectIncludeAliasesFromAst(ast: nodes.ThriftDocument): Set<string> {
    const includeAliases = new Set<string>();
    for (const node of ast.body) {
        if (node.type === nodes.ThriftNodeType.Include) {
            const includePath = (node as nodes.Include).path;
            const alias = path.basename(includePath, '.thrift');
            if (alias) {
                includeAliases.add(alias);
            }
        }
    }
    return includeAliases;
}

/**
 * 构建诊断上下文（include 别名 + 已定义类型集合）。
 */
export function buildAnalysisContext(ast: nodes.ThriftDocument): AnalysisContext {
    return {
        includeAliases: collectIncludeAliasesFromAst(ast),
        typeKind: collectTypesFromAst(ast)
    };
}

/**
 * 执行 AST 级别诊断并返回问题列表。
 */
export function analyzeThriftAst(
    ast: nodes.ThriftDocument,
    lines: string[],
    includedTypes?: Map<string, string>,
    context?: AnalysisContext,
    analysisScope?: LineRange
): ThriftIssue[] {
    const issues: ThriftIssue[] = [];

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
                if (!isKnownType(baseType, definedTypes, includeAliases) && !PRIMITIVES.has(baseType)) {
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
