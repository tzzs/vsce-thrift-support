import * as vscode from 'vscode';
import { ThriftParser } from '../../ast/parser';
import * as nodes from '../../ast/nodes.types';
import { collectTypesFromAst } from '../include-resolver';
import { LineRange, normalizeLineRange, rangeIntersectsLineRange } from '../../utils/line-range';
import { stripCommentsFromLine } from '../utils';
import { ThriftIssue } from '../types';
import { collectIncludeAliasesFromAst, AnalysisContext } from './analysis-context';
import { getPrimitiveTypes } from './type-utils';

import { checkService } from './service-check';
import { checkStruct } from './struct-check';
import { checkTypedef, checkConst, checkEnum } from './general-check';
import { checkSyntax } from './syntax-check';

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

    // Check Nodes
    for (const node of ast.body) {
        switch (node.type) {
            case nodes.ThriftNodeType.Service:
                checkService(node as nodes.Service, lines, definedTypes, includeAliases, typeKind, issues);
                break;
            case nodes.ThriftNodeType.Struct:
            case nodes.ThriftNodeType.Union:
            case nodes.ThriftNodeType.Exception:
                checkStruct(node as nodes.Struct, definedTypes, includeAliases, issues);
                break;
            case nodes.ThriftNodeType.Typedef:
                checkTypedef(node as nodes.Typedef, lines, definedTypes, includeAliases, issues);
                break;
            case nodes.ThriftNodeType.Const:
                checkConst(node as nodes.Const, lines, definedTypes, includeAliases, issues);
                break;
            case nodes.ThriftNodeType.Enum:
                checkEnum(node as nodes.Enum, issues);
                break;
            default:
                break;
        }
    }

    // Check Syntax
    checkSyntax(codeLines, issues);

    // Apply Scope
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
