import * as path from 'path';
import * as nodes from '../../ast/nodes.types';
import {collectTypesFromAst} from '../include-resolver';

export interface AnalysisContext {
    includeAliases: Set<string>;
    typeKind: Map<string, string>;
}

/**
 * 提取 include 别名集合，用于命名空间类型解析。
 * @param ast 当前 AST
 * @returns include 别名集合
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
 * @param ast 当前 AST
 * @returns 分析上下文
 */
export function buildAnalysisContext(ast: nodes.ThriftDocument): AnalysisContext {
    return {
        includeAliases: collectIncludeAliasesFromAst(ast),
        typeKind: collectTypesFromAst(ast)
    };
}
